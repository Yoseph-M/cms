import { logger } from './logger';
import { CMSApiClient } from './api-client';
import { printToWindowsPrinter } from './windows-printer';
import { PrintJob } from './types';

/**
 * Process a single print job
 */
export async function processPrintJob(
  job: PrintJob,
  apiClient: CMSApiClient
): Promise<void> {
  const { id, station, printerName, payloadBase64, attempts, maxAttempts } = job;

  logger.info({ 
    jobId: id, 
    station, 
    printerName, 
    attempt: attempts + 1,
    maxAttempts 
  }, 'Processing print job');

  // Validate printer name
  if (!printerName) {
    const error = 'No printer name configured for this station';
    logger.error({ jobId: id, station }, error);
    await apiClient.ackJob(id, 'FAILED', error);
    return;
  }

  // Decode the ESC/POS payload
  let rawData: Buffer;
  try {
    rawData = Buffer.from(payloadBase64, 'base64');
    logger.debug({ jobId: id, dataSize: rawData.length }, 'Decoded print payload');
  } catch (err) {
    const error = 'Failed to decode base64 payload';
    logger.error({ jobId: id, err }, error);
    await apiClient.ackJob(id, 'FAILED', error);
    return;
  }

  // Attempt to print
  try {
    // Claim the job first
    const claimed = await apiClient.claimJob(id);
    
    if (!claimed) {
      logger.warn({ jobId: id }, 'Job was claimed by another agent, skipping');
      return;
    }

    // Print to Windows spooler
    const result = await printToWindowsPrinter(printerName, rawData);

    if (result.success) {
      // Success - acknowledge as PRINTED
      await apiClient.ackJob(id, 'PRINTED');
      logger.info({ jobId: id, station, printerName }, '✓ Print job completed successfully');
    } else {
      // Printer error - acknowledge as FAILED
      await apiClient.ackJob(id, 'FAILED', result.error);
      logger.error({ jobId: id, station, printerName, error: result.error }, '✗ Print job failed');
    }
  } catch (err: any) {
    const error = err.message || 'Unknown error during print job processing';
    logger.error({ jobId: id, err }, 'Exception while processing print job');
    
    try {
      await apiClient.ackJob(id, 'FAILED', error);
    } catch (ackErr) {
      logger.error({ jobId: id, ackErr }, 'Failed to acknowledge job failure');
    }
  }
}

/**
 * Process all pending jobs for configured stations
 */
export async function processPendingJobs(
  apiClient: CMSApiClient,
  stations: string[]
): Promise<void> {
  for (const station of stations) {
    try {
      const jobs = await apiClient.getPendingJobs(station);
      
      if (jobs.length === 0) {
        logger.debug({ station }, 'No pending jobs');
        continue;
      }

      logger.info({ station, count: jobs.length }, 'Found pending print jobs');

      // Process jobs sequentially to avoid overwhelming the printer
      for (const job of jobs) {
        await processPrintJob(job, apiClient);
      }
    } catch (err: any) {
      logger.error({ station, err: err.message }, 'Error checking pending jobs for station');
    }
  }
}
