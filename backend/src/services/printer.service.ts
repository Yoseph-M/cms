import net from 'net';
import { logger } from '../utils/logger';
import { emitToLiveOrders } from './socket.service';
import { createNotification } from './notification.service';
import { prisma } from './prisma.service';
import { getCached, setCache, invalidateCache } from './cache.service';
import { PrismaClient, PrintJobStatus, PrintTransport } from '@prisma/client';

export interface PrinterStation {
  id?: string;
  /**
   * Internal routing key. Owners no longer pick a station when adding a printer
   * (see `resolveKitchenPrinter`), but an explicit `kitchen` station from older
   * configurations is still honoured.
   */
  station: string;
  transport: PrintTransport;
  macAddress: string | null;
  vendorId: string | null;
  productId: string | null;
  ip: string | null;
  port: number | null;
}

const PRINTER_CACHE_KEY = 'printers:all';
const PRINTER_CACHE_TTL_MS = 60_000;

const failedPrinters = new Set<string>();

/**
 * The printer that receives kitchen tickets.
 *
 * Printers are plain devices in the UI now — there is no station picker — so the
 * first configured printer is the ticket printer. A stored `kitchen` station
 * (from an older setup) still wins.
 */
export function resolveKitchenPrinter(printers: PrinterStation[]): PrinterStation | undefined {
  return printers.find((p) => p.station === 'kitchen') ?? printers[0];
}

async function loadPrintersFromDb(): Promise<PrinterStation[]> {
  const cached = getCached<PrinterStation[]>(PRINTER_CACHE_KEY);
  if (cached) return cached;

  // Oldest first, so the owner's first printer stays the ticket printer and the
  // first card on screen is always the one that prints.
  const rows = await prisma.printerStation.findMany({ orderBy: { createdAt: 'asc' } });
  const mapped = rows.map((r) => ({
    id: r.id,
    station: r.station,
    transport: r.transport,
    macAddress: r.macAddress,
    vendorId: r.vendorId,
    productId: r.productId,
    ip: r.ip ?? null,
    port: r.port ?? null,
  }));

  // The ticket printer leads, whatever its creation order (records written in
  // one transaction can share a millisecond). Sort is stable, so the rest keep
  // the oldest-first order.
  mapped.sort((a, b) => Number(b.station === 'kitchen') - Number(a.station === 'kitchen'));

  setCache(PRINTER_CACHE_KEY, mapped, PRINTER_CACHE_TTL_MS);
  return mapped;
}

export async function getPrinterRegistry(): Promise<PrinterStation[]> {
  return loadPrintersFromDb();
}

export function invalidatePrinterCache(): void {
  invalidateCache(PRINTER_CACHE_KEY);
}

/**
 * IMPORTANT: ESC/POS Character Encoding
 * 
 * This function generates ESC/POS commands using ASCII encoding.
 * 
 * LIMITATION: ASCII encoding does NOT support:
 * - Amharic script (ኣ, ብ, ሰ, etc.)
 * - Extended Unicode characters
 * - Special symbols outside ASCII range
 * 
 * For cafes using Amharic or other non-ASCII languages:
 * 1. Ensure thermal printer supports Code Page 1252 or UTF-8
 * 2. Update this function to use appropriate character encoding
 * 3. Test with actual printer to verify correct rendering
 * 4. Consider using printer-specific character set commands
 * 
 * Example for UTF-8 support:
 *   commands.push(0x1b, 0x74, 0x10); // Select character code table 16 (UTF-8)
 * 
 * PRINTED Status Semantics:
 * - PRINTED means: "Successfully submitted to Windows spooler" (for Windows agents)
 * - PRINTED means: "Successfully sent to TCP printer" (for TCP transport)
 * - PRINTED does NOT guarantee physical paper was printed
 * - Physical confirmation requires printer-specific status polling
 */
export function buildEscPosKitchenTicket(order: {
  clientOrderId: string;
  tableNumber: string;
  waiterName?: string;
  createdAt: Date | string;
  items: Array<{ name: string; quantity: number; notes?: string }>;
}): Buffer {
  const commands: number[] = [];

  commands.push(0x1b, 0x40);
  commands.push(0x1b, 0x61, 0x01);
  commands.push(0x1d, 0x21, 0x11);
  commands.push(...Buffer.from('=== KITCHEN TICKET ===\n\n', 'ascii'));
  commands.push(0x1d, 0x21, 0x00);
  commands.push(0x1b, 0x61, 0x00);

  const formattedDate = new Date(order.createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  commands.push(...Buffer.from(`Table: #${order.tableNumber}\n`, 'ascii'));
  commands.push(...Buffer.from(`Waiter: ${order.waiterName || 'Staff'}\n`, 'ascii'));
  commands.push(...Buffer.from(`Time: ${formattedDate}\n`, 'ascii'));
  commands.push(...Buffer.from(`Order Ref: ${order.clientOrderId.slice(0, 8)}\n`, 'ascii'));
  commands.push(...Buffer.from('--------------------------------\n', 'ascii'));
  commands.push(...Buffer.from('QTY  ITEM                   NOTES\n', 'ascii'));
  commands.push(...Buffer.from('--------------------------------\n', 'ascii'));

  for (const item of order.items) {
    const qtyStr = `${item.quantity}x`.padEnd(5, ' ');
    const nameStr = item.name.padEnd(20, ' ').slice(0, 20);
    commands.push(...Buffer.from(`${qtyStr}${nameStr}\n`, 'ascii'));
    if (item.notes && item.notes.trim()) {
      commands.push(...Buffer.from(`  -> Note: ${item.notes}\n`, 'ascii'));
    }
  }

  commands.push(...Buffer.from('--------------------------------\n\n', 'ascii'));
  commands.push(0x1d, 0x56, 0x42, 0x00);

  return Buffer.from(commands);
}

/**
 * Turns a raw printing error into a short, human sentence. Floor staff should
 * never have to read "navigator.bluetooth.getDevices is not supported in this
 * browser" — they only need to know the ticket didn't print and what to do.
 */
const PLAIN_PRINT_REASONS: Array<{ match: RegExp; text: string }> = [
  { match: /bluetooth|getDevices|WebBluetooth/i, text: 'the printer is not connected to this device' },
  { match: /usb|WebUSB/i, text: 'the USB printer is not connected' },
  { match: /not found|not permitted|pair|not set up/i, text: 'this device does not know the printer yet' },
  { match: /no kitchen printer|not configured|not set.?up/i, text: 'no kitchen printer has been set up yet' },
  { match: /timeout|timed out|did not respond/i, text: 'the printer did not answer' },
  { match: /paper|empty/i, text: 'the printer may be out of paper' },
  { match: /offline|unreachable|refused|network|socket/i, text: 'the printer is not reachable' },
];

export function humanizePrintReason(reason?: string | null): string {
  if (!reason) return 'the printer did not answer';
  for (const rule of PLAIN_PRINT_REASONS) {
    if (rule.match.test(reason)) return rule.text;
  }
  return 'the printer did not answer';
}

/**
 * Tell everyone who can act that an order's kitchen ticket never made it to
 * paper. The order itself is untouched — it stays on the Tickets page — but the
 * cashier sees a banner and Owner/Manager get a notification in the bell so
 * "nothing printed" is never a silent failure.
 */
export async function notifyKitchenPrintFailure(
  order: { id: string; tableNumber?: string | null },
  reason: string,
  deviceLabel?: string | null,
) {
  const tableText = order.tableNumber ? `Table ${order.tableNumber}` : 'A takeout order';
  const message = `${tableText}: the kitchen ticket did not print, because ${humanizePrintReason(reason)}. Tap Reprint on the Tickets page.`;

  try {
    await createNotification({
      type: 'PRINTER_FAILURE',
      severity: 'warning',
      message,
      relatedId: order.id,
    });
  } catch (err) {
    logger.error({ err, orderId: order.id }, 'Failed to create printer failure notification');
  }

  emitToLiveOrders('printer:failed', {
    station: 'kitchen',
    device: deviceLabel ?? '',
    orderId: order.id,
    failedAt: new Date().toISOString(),
  });
}

export const DEFAULT_NETWORK_PRINT_PORT = 9100;
const NETWORK_PRINT_TIMEOUT_MS = 8_000;

/**
 * Send a raw ESC/POS payload straight to a network (Wi-Fi / Ethernet) printer.
 *
 * This is the agentless path: the server opens a TCP connection to the printer
 * and writes the ticket bytes, so nothing has to be paired in a browser and no
 * local print agent has to be running. Resolving means the printer accepted the
 * bytes — the same "submitted" semantics as the USB/Bluetooth paths.
 */
export async function sendToNetworkPrinter(
  ip: string,
  port: number | null | undefined,
  payload: Buffer,
  timeoutMs = NETWORK_PRINT_TIMEOUT_MS,
): Promise<void> {
  const targetPort = port && port > 0 ? port : DEFAULT_NETWORK_PRINT_PORT;

  await new Promise<void>((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (err) reject(err);
      else resolve();
    };

    socket.setTimeout(timeoutMs);
    socket.once('error', (err) => finish(err));
    socket.once('timeout', () => finish(new Error('Printer connection timed out')));
    socket.once('close', () => finish());

    socket.connect(targetPort, ip, () => {
      socket.write(payload, (writeErr) => {
        if (writeErr) return finish(writeErr);
        // End the stream so the printer flushes the ticket, then 'close' resolves.
        socket.end();
      });
    });
  });
}

export async function enqueueKitchenPrintJob(
  tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>,
  order: {
    id: string;
    clientOrderId: string;
    tableNumber: string;
    waiterName?: string;
    createdAt: Date | string;
    items: Array<{ name: string; quantity: number; notes?: string }>;
  }
) {
  const printers = await getPrinterRegistry();
  const kitchenPrinter = resolveKitchenPrinter(printers);
  if (!kitchenPrinter) {
    logger.warn('No kitchen printer configured in registry.');
    return null;
  }

  const ticketBuffer = buildEscPosKitchenTicket(order);
  const payloadBase64 = ticketBuffer.toString('base64');

  const printJob = await tx.printJob.create({
    data: {
      orderId: order.id,
      station: kitchenPrinter.station,
      transport: kitchenPrinter.transport as PrintTransport,
      printerMacAddress: kitchenPrinter.macAddress,
      printerVendorId: kitchenPrinter.vendorId,
      printerProductId: kitchenPrinter.productId,
      payloadBase64,
      status: PrintJobStatus.QUEUED,
    },
  });

  return printJob;
}

