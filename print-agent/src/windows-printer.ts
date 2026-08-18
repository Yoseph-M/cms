import { logger } from './logger';
import { PrintJobResult } from './types';
import { printerModule, isPrinterAvailable } from './printer-discovery';

/**
 * Print RAW ESC/POS data to a Windows printer
 * 
 * This uses the Windows print spooler to send raw bytes to the printer.
 * The ESC/POS commands are preserved and sent directly to the thermal printer.
 */
export async function printToWindowsPrinter(
  printerName: string,
  rawData: Buffer
): Promise<PrintJobResult> {
  if (!printerModule) {
    const error = 'Printer module not available - agent must run on Windows';
    logger.error(error);
    return { success: false, error };
  }

  // Validate printer exists and is available
  if (!isPrinterAvailable(printerName)) {
    const error = `Printer "${printerName}" is not available or offline`;
    logger.error({ printerName }, error);
    return { success: false, error };
  }

  try {
    logger.info({ printerName, dataSize: rawData.length }, 'Submitting RAW print job to Windows spooler');

    // Print RAW data using the printer module
    // This sends bytes directly to the Windows spooler with RAW datatype
    await new Promise<void>((resolve, reject) => {
      printerModule.printDirect({
        data: rawData,
        printer: printerName,
        type: 'RAW', // Critical: RAW mode preserves ESC/POS commands
        success: (jobId: string) => {
          logger.info({ printerName, jobId }, 'Print job submitted to Windows spooler successfully');
          resolve();
        },
        error: (err: Error) => {
          logger.error({ printerName, err }, 'Windows spooler rejected print job');
          reject(err);
        },
      });
    });

    return { success: true };
  } catch (err: any) {
    const error = err.message || 'Unknown Windows printing error';
    logger.error({ printerName, err }, 'Failed to print to Windows printer');
    return { success: false, error };
  }
}

/**
 * Print a test ticket to verify printer connectivity
 */
export async function printTestTicket(printerName: string): Promise<PrintJobResult> {
  // Build a simple test ticket using ESC/POS commands
  const commands: number[] = [];
  
  // Initialize printer
  commands.push(0x1b, 0x40);
  
  // Center align
  commands.push(0x1b, 0x61, 0x01);
  
  // Large text
  commands.push(0x1d, 0x21, 0x11);
  commands.push(...Buffer.from('=== TEST PRINT ===\n\n', 'ascii'));
  
  // Normal text, left align
  commands.push(0x1d, 0x21, 0x00);
  commands.push(0x1b, 0x61, 0x00);
  
  const timestamp = new Date().toLocaleString();
  commands.push(...Buffer.from(`Printer: ${printerName}\n`, 'ascii'));
  commands.push(...Buffer.from(`Time: ${timestamp}\n`, 'ascii'));
  commands.push(...Buffer.from('\nIf you can read this,\n', 'ascii'));
  commands.push(...Buffer.from('Windows Print Agent is working!\n\n\n', 'ascii'));
  
  // Cut paper
  commands.push(0x1d, 0x56, 0x42, 0x00);
  
  const buffer = Buffer.from(commands);
  
  return printToWindowsPrinter(printerName, buffer);
}
