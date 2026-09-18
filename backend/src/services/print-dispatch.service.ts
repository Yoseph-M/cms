import { prisma } from './prisma.service';
import {
  getPrinterRegistry,
  sendToNetworkPrinter,
  humanizePrintReason,
  type PrinterStation,
} from './printer.service';
import { createNotification } from './notification.service';
import { emitToLiveOrders } from './socket.service';
import { PrintJobStatus, PrintTransport } from '@prisma/client';
import { logger } from '../utils/logger';

/**
 * Print Dispatch Service
 *
 * Owns the server-side half of kitchen printing:
 *
 *  1. NETWORK printers — the agentless path. Every tick, queued tickets for a
 *     Wi-Fi/Ethernet printer are written straight from the backend over TCP.
 *     Nothing has to be paired in a browser and no local print agent has to be
 *     running.
 *
 *  2. Browser / agent (USB, BLUETOOTH) fallback — those jobs are still claimed
 *     by the existing WebUSB/WebBluetooth client or the Windows print agent.
 *     If nobody picks them up, this service makes the failure visible instead of
 *     leaving the ticket QUEUED forever:
 *       • after ~3 minutes → a plain-language notification
 *       • after ~10 minutes → the job is marked FAILED so the Tickets page shows
 *         a red "Failed" badge the cashier can reprint with one tap.
 */

const DISPATCH_INTERVAL_MS = 20_000;
/** Minimum gap between two network attempts for the same job. */
const RETRY_AFTER_MS = 30_000;
/** How long a ticket may sit unclaimed before a human is told about it. */
export const PRINT_NOTIFY_AFTER_MS = 3 * 60_000;
/** How long a ticket may sit unclaimed before it is marked FAILED. */
export const PRINT_FAIL_AFTER_MS = 10 * 60_000;

class PrintDispatchService {
  private intervalHandle: NodeJS.Timeout | null = null;
  private isRunning = false;
  private isTicking = false;

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    logger.info(
      { intervalMs: DISPATCH_INTERVAL_MS, notifyAfterMs: PRINT_NOTIFY_AFTER_MS, failAfterMs: PRINT_FAIL_AFTER_MS },
      'Print dispatch service started',
    );

    this.tick().catch((err) => logger.error({ err }, 'Initial print dispatch failed'));
    this.intervalHandle = setInterval(() => {
      this.tick().catch((err) => logger.error({ err }, 'Scheduled print dispatch failed'));
    }, DISPATCH_INTERVAL_MS);
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    this.isRunning = false;
    logger.info('Print dispatch service stopped');
  }

  /** Runs one dispatch + escalation cycle. Exposed for tests/manual sweeps. */
  async tick(): Promise<void> {
    if (this.isTicking) return;
    this.isTicking = true;
    try {
      await this.dispatchNetworkJobs();
      await this.escalateStuckJobs();
    } finally {
      this.isTicking = false;
    }
  }

  /** Push queued tickets to every configured NETWORK printer. */
  private async dispatchNetworkJobs(): Promise<void> {
    const printers = await getPrinterRegistry();
    const networkPrinters = printers.filter(
      (p): p is PrinterStation & { ip: string } =>
        p.transport === PrintTransport.NETWORK && Boolean(p.ip),
    );
    if (networkPrinters.length === 0) return;

    const jobs = await prisma.printJob.findMany({
      where: {
        status: PrintJobStatus.QUEUED,
        transport: PrintTransport.NETWORK,
        station: { in: networkPrinters.map((p) => p.station) },
      },
      include: { order: { select: { id: true, tableNumber: true } } },
      orderBy: { createdAt: 'asc' },
      take: 25,
    });

    for (const job of jobs) {
      if (job.lastAttemptAt && Date.now() - job.lastAttemptAt.getTime() < RETRY_AFTER_MS) {
        continue;
      }

      const printer = networkPrinters.find((p) => p.station === job.station);
      if (!printer) continue;

      const attempts = job.attempts + 1;
      try {
        await sendToNetworkPrinter(
          printer.ip,
          printer.port,
          Buffer.from(job.payloadBase64, 'base64'),
        );

        await prisma.printJob.update({
          where: { id: job.id },
          data: {
            status: PrintJobStatus.PRINTED,
            attempts,
            printedAt: new Date(),
            lastAttemptAt: new Date(),
            lastError: null,
          },
        });

        emitToLiveOrders('printJob:updated', {
          jobId: job.id,
          orderId: job.orderId,
          status: PrintJobStatus.PRINTED,
        });
        logger.info({ jobId: job.id, orderId: job.orderId, station: job.station }, 'Kitchen ticket sent to network printer');
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const exhausted = attempts >= job.maxAttempts;

        await prisma.printJob.update({
          where: { id: job.id },
          data: {
            status: exhausted ? PrintJobStatus.FAILED : PrintJobStatus.QUEUED,
            attempts,
            lastAttemptAt: new Date(),
            lastError: message,
          },
        });

        if (exhausted) {
          logger.error({ jobId: job.id, orderId: job.orderId, station: job.station, message }, 'Network print failed after max attempts');
          await this.notifyFailure(
            job.orderId ?? job.id,
            job.order?.tableNumber ?? null,
            message,
          );
          emitToLiveOrders('printJob:failed', {
            jobId: job.id,
            orderId: job.orderId,
            station: job.station,
            error: message,
          });
        } else {
          logger.warn({ jobId: job.id, attempt: attempts, message }, 'Network print attempt failed — will retry');
        }
      }
    }
  }

  /**
   * Make unclaimed tickets visible. Nothing will print a USB/Bluetooth ticket
   * when no browser or agent is around, so we alert, then give up.
   */
  private async escalateStuckJobs(): Promise<void> {
    const notifyCutoff = new Date(Date.now() - PRINT_NOTIFY_AFTER_MS);
    const failCutoff = new Date(Date.now() - PRINT_FAIL_AFTER_MS);

    const stuckJobs = await prisma.printJob.findMany({
      where: { status: PrintJobStatus.QUEUED, createdAt: { lt: notifyCutoff } },
      include: { order: { select: { id: true, tableNumber: true } } },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });

    for (const job of stuckJobs) {
      const stillWaiting = job.createdAt < failCutoff;
      if (!stillWaiting) {
        await this.notifyStuck(job.orderId, job.order?.tableNumber ?? null, job.id);
        continue;
      }

      await prisma.printJob.update({
        where: { id: job.id },
        data: {
          status: PrintJobStatus.FAILED,
          lastError: job.lastError ?? 'No printer picked up the ticket in time',
        },
      });

      logger.warn({ jobId: job.id, orderId: job.orderId, station: job.station }, 'Queued print job marked FAILED (no consumer picked it up)');

      emitToLiveOrders('printJob:failed', {
        jobId: job.id,
        orderId: job.orderId,
        station: job.station,
        error: job.lastError ?? 'No printer picked up the ticket in time',
      });

      await this.notifyFailure(
        job.orderId ?? job.id,
        job.order?.tableNumber ?? null,
        job.lastError,
      );
    }
  }

  private async notifyStuck(
    orderId: string | null,
    tableNumber: string | null,
    fallbackKey: string,
  ): Promise<void> {
    const relatedId = orderId ?? fallbackKey;
    if (await this.alreadyNotified(relatedId, PRINT_NOTIFY_AFTER_MS * 2)) return;

    const tableText = tableNumber ? `Table ${tableNumber}` : 'A takeout order';
    await this.safeNotify(
      `${tableText}: the kitchen ticket still hasn't printed. Open the Tickets page and tap Reprint.`,
      relatedId,
    );
  }

  private async notifyFailure(
    relatedId: string,
    tableNumber: string | null,
    reason?: string | null,
  ): Promise<void> {
    const key = relatedId;
    if (await this.alreadyNotified(key, 60 * 60_000)) return;

    const tableText = tableNumber ? `Table ${tableNumber}` : 'A takeout order';
    await this.safeNotify(
      `${tableText}: the kitchen ticket did not print, because ${humanizePrintReason(reason)}. Tap Reprint on the Tickets page.`,
      key,
    );
  }

  private async alreadyNotified(relatedId: string, windowMs: number): Promise<boolean> {
    const existing = await prisma.notification.findFirst({
      where: {
        type: 'PRINTER_FAILURE',
        relatedId,
        createdAt: { gte: new Date(Date.now() - windowMs) },
      },
      select: { id: true },
    });
    return Boolean(existing);
  }

  private async safeNotify(message: string, relatedId: string): Promise<void> {
    try {
      await createNotification({
        type: 'PRINTER_FAILURE',
        severity: 'warning',
        message,
        relatedId,
      });
    } catch (err) {
      logger.error({ err, relatedId }, 'Failed to create print failure notification');
    }
  }
}

export const printDispatchService = new PrintDispatchService();
