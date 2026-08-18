import { logger } from './logger';
import { WindowsPrinter } from './types';

// Dynamic import of printer module (only available on Windows)
let printerModule: any = null;

try {
  // The 'printer' npm package uses native bindings and only works on Windows
  printerModule = require('printer');
  logger.info('Windows printer module loaded successfully');
} catch (err) {
  logger.warn('Printer module not available - this agent must run on Windows');
}

/**
 * Discover all printers installed on Windows
 */
export function discoverWindowsPrinters(): WindowsPrinter[] {
  if (!printerModule) {
    logger.error('Printer module not loaded - cannot discover printers');
    return [];
  }

  try {
    const printers = printerModule.getPrinters();
    
    const mapped: WindowsPrinter[] = printers.map((p: any) => ({
      name: p.name,
      description: p.description || p.name,
      status: p.status || 'UNKNOWN',
      isDefault: p.isDefault || false,
      deviceId: p.deviceID || p.name,
    }));

    logger.info({ count: mapped.length }, 'Discovered Windows printers');
    return mapped;
  } catch (err) {
    logger.error({ err }, 'Failed to discover Windows printers');
    return [];
  }
}

/**
 * Get a specific printer by name
 */
export function getPrinterByName(printerName: string): WindowsPrinter | null {
  const printers = discoverWindowsPrinters();
  const found = printers.find(p => p.name === printerName);
  
  if (!found) {
    logger.warn({ printerName }, 'Printer not found in Windows');
  }
  
  return found || null;
}

/**
 * Check if a printer exists and is available
 */
export function isPrinterAvailable(printerName: string): boolean {
  const printer = getPrinterByName(printerName);
  
  if (!printer) {
    return false;
  }

  // Some printers report status, others don't
  // If no status info, assume available
  if (!printer.status || printer.status === 'UNKNOWN') {
    return true;
  }

  // Check for common error states
  const unavailableStates = ['OFFLINE', 'ERROR', 'PAUSED', 'PAPER_JAM', 'PAPER_OUT'];
  const isUnavailable = unavailableStates.some(state => 
    printer.status?.toUpperCase().includes(state)
  );

  return !isUnavailable;
}

export { printerModule };
