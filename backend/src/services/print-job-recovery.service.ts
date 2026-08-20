import { prisma } from './prisma.service';
import { PrintJobStatus } from '@prisma/client';
import { logger } from '../utils/logger';
import { emitToLiveOrders } from './socket.service';

/**
 * Print Job Recovery Service
 * 
 * Recovers stale print jobs that are stuck in PRINTING state due to agent crashes.
 * 
 * IMPORTANT: This must be carefully designed to avoid duplicate printing.
 * A job may have been successfully submitted to the Windows spooler even if the
 * ACK never reached the backend.
 * 
 * Recovery Strategy:
 * - Jobs in PRINTING state for > 5 minutes are considered stale
 * - Stale jobs are reset to QUEUED status only if attempts < maxAttempts
 * - Jobs that have exceeded maxAttempts remain in FAILED state
 * - Recovery is logged for operational visibility
 */

const STALE_JOB_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const RECOVERY_INTERVAL_MS = 60 * 1000; // Check every 60 seconds

export class PrintJobRecoveryService {
  private intervalHandle: NodeJS.Timeout | null = null;
  private isRunning = false;

  /**
   * Start the recovery service
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('Print job recovery service already running');
      return;
    }

    this.isRunning = true;
    logger.info({ 
      staleThresholdMs: STALE_JOB_THRESHOLD_MS, 
      intervalMs: RECOVERY_INTERVAL_MS 
    }, 'Starting print job recovery service');

    // Run immediately on start
    this.recoverStaleJobs().catch(err => {
      logger.error({ err }, 'Error during initial stale job recovery');
    });

    // Then run periodically
    this.intervalHandle = setInterval(() => {
      this.recoverStaleJobs().catch(err => {
        logger.error({ err }, 'Error during scheduled stale job recovery');
      });
    }, RECOVERY_INTERVAL_MS);
  }

  /**
   * Stop the recovery service
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }

    this.isRunning = false;
    logger.info('Print job recovery service stopped');
  }

  /**
   * Recover stale print jobs
   * 
   * This identifies jobs stuck in PRINTING state and resets them to QUEUED
   * for retry, unless they have exceeded maximum attempts.
   */
  private async recoverStaleJobs(): Promise<void> {
    const staleThreshold = new Date(Date.now() - STALE_JOB_THRESHOLD_MS);

    try {
      // Find jobs in PRINTING state that were claimed more than threshold ago
      const staleJobs = await prisma.printJob.findMany({
        where: {
          status: PrintJobStatus.PRINTING,
          claimedAt: {
            lt: staleThreshold,
          },
        },
        include: {
          claimedBy: {
            select: {
              id: true,
              name: true,
              station: true,
              isRevoked: true,
            },
          },
        },
      });

      if (staleJobs.length === 0) {
        logger.debug('No stale print jobs found');
        return;
      }

      logger.warn({ 
        count: staleJobs.length, 
        threshold: staleThreshold.toISOString() 
      }, 'Found stale print jobs requiring recovery');

      for (const job of staleJobs) {
        await this.recoverSingleJob(job);
      }

      logger.info({ recoveredCount: staleJobs.length }, 'Stale job recovery cycle completed');
    } catch (err) {
      logger.error({ err }, 'Failed to recover stale jobs');
      throw err;
    }
  }

  /**
   * Recover a single stale job
   * 
   * Decision logic:
   * - If attempts < maxAttempts: Reset to QUEUED for retry
   * - If attempts >= maxAttempts: Mark as FAILED
   * - If claimed by revoked agent: Reset to QUEUED regardless of attempts
   */
  private async recoverSingleJob(job: any): Promise<void> {
    const jobAge = Date.now() - (job.claimedAt?.getTime() || job.createdAt.getTime());
    const ageMinutes = Math.floor(jobAge / 60000);

    logger.warn({
      jobId: job.id,
      orderId: job.orderId,
      station: job.station,
      claimedById: job.claimedById,
      claimedByName: job.claimedBy?.name,
      claimedByRevoked: job.claimedBy?.isRevoked,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      ageMinutes,
    }, 'Recovering stale print job');

    // Determine recovery action
    const agentRevoked = job.claimedBy?.isRevoked === true;
    const canRetry = job.attempts < job.maxAttempts;

    if (agentRevoked || canRetry) {
      // Reset to QUEUED for retry
      await prisma.printJob.update({
        where: { id: job.id },
        data: {
          status: PrintJobStatus.QUEUED,
          claimedById: null,
          claimedAt: null,
          lastError: agentRevoked 
            ? 'Agent was revoked - job automatically recovered' 
            : `Stale job recovered after ${ageMinutes} minutes without ACK`,
        },
      });

      logger.info({
        jobId: job.id,
        orderId: job.orderId,
        station: job.station,
        reason: agentRevoked ? 'agent_revoked' : 'stale_recovery',
      }, 'Print job reset to QUEUED for retry');

      emitToLiveOrders('printJob:recovered', {
        jobId: job.id,
        orderId: job.orderId,
        station: job.station,
        newStatus: PrintJobStatus.QUEUED,
      });
    } else {
      // Max attempts exceeded - mark as FAILED
      await prisma.printJob.update({
        where: { id: job.id },
        data: {
          status: PrintJobStatus.FAILED,
          lastError: `Job abandoned after ${job.attempts} attempts (stale for ${ageMinutes} minutes)`,
        },
      });

      logger.error({
        jobId: job.id,
        orderId: job.orderId,
        station: job.station,
        attempts: job.attempts,
        maxAttempts: job.maxAttempts,
      }, 'Print job marked as FAILED - max attempts exceeded');

      emitToLiveOrders('printJob:failed', {
        jobId: job.id,
        orderId: job.orderId,
        station: job.station,
        error: 'Max print attempts exceeded',
      });
    }
  }

  /**
   * Manually trigger recovery check (for testing or admin operations)
   */
  async triggerRecovery(): Promise<number> {
    const staleThreshold = new Date(Date.now() - STALE_JOB_THRESHOLD_MS);
    
    const staleJobs = await prisma.printJob.findMany({
      where: {
        status: PrintJobStatus.PRINTING,
        claimedAt: {
          lt: staleThreshold,
        },
      },
    });

    logger.info({ count: staleJobs.length }, 'Manual recovery triggered');

    for (const job of staleJobs) {
      await this.recoverSingleJob(job);
    }

    return staleJobs.length;
  }
}

// Singleton instance
export const printJobRecoveryService = new PrintJobRecoveryService();
