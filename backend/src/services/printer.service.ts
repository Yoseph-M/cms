import net from 'net';
import { logger } from '../utils/logger';
import { emitToLiveOrders } from './socket.service';
import { createNotification } from './notification.service';
import { prisma } from './prisma.service';
import { getCached, setCache, invalidateCache } from './cache.service';
import {
  DEFAULT_RECEIPT_SETTINGS,
  getReceiptSettings,
  type ReceiptSettings,
} from './receipt-settings.service';
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
/** ESC/POS printers only render the character table they are set to. */
function ascii(text: string): string {
  return text.replace(/[^\x20-\x7e]/g, '?');
}

/** Characters that fit on one line of the configured paper. */
export function ticketColumns(settings: ReceiptSettings): number {
  return settings.paperSize === '58mm' ? 32 : 48;
}

function centerLine(text: string, columns: number): string {
  const clean = ascii(text).trim();
  if (!clean) return '';
  const pad = Math.max(0, Math.floor((columns - clean.length) / 2));
  return `${' '.repeat(pad)}${clean}`;
}

/** Word-wrap, splitting words longer than one line instead of truncating them. */
function wrapLine(text: string, columns: number): string[] {
  const words = ascii(text).trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    let remaining = word;
    while (remaining.length > columns) {
      if (current) {
        lines.push(current);
        current = '';
      }
      lines.push(remaining.slice(0, columns));
      remaining = remaining.slice(columns);
    }
    if (!current) current = remaining;
    else if (current.length + 1 + remaining.length <= columns) current += ` ${remaining}`;
    else {
      lines.push(current);
      current = remaining;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function buildEscPosKitchenTicket(
  order: {
    clientOrderId: string;
    tableNumber: string;
    waiterName?: string;
    createdAt: Date | string;
    items: Array<{ name: string; quantity: number; notes?: string }>;
  },
  settings: ReceiptSettings = DEFAULT_RECEIPT_SETTINGS,
): Buffer {
  const columns = ticketColumns(settings);
  const divider = '-'.repeat(columns);
  const commands: number[] = [];

  commands.push(0x1b, 0x40); // initialise

  // Business header, exactly as configured in Settings → Receipts & Printing.
  const contactLines: string[] = [];
  if (settings.showBusinessPhone && settings.businessPhone.trim()) {
    contactLines.push(settings.businessPhone.trim());
  }
  if (settings.showBusinessAddress && settings.businessAddress.trim()) {
    contactLines.push(settings.businessAddress.trim());
  }
  if (settings.showEmail && settings.businessEmail.trim()) {
    contactLines.push(settings.businessEmail.trim());
  }

  if (settings.showBusinessName && settings.businessName.trim()) {
    commands.push(0x1b, 0x61, 0x01); // centre
    commands.push(0x1b, 0x45, 0x01); // bold
    for (const line of wrapLine(settings.businessName, columns)) {
      commands.push(...Buffer.from(`${centerLine(line, columns)}\n`, 'ascii'));
    }
    commands.push(0x1b, 0x45, 0x00);
  }

  if (contactLines.length > 0) {
    commands.push(0x1b, 0x61, 0x01);
    for (const contact of contactLines) {
      for (const line of wrapLine(contact, columns)) {
        commands.push(...Buffer.from(`${centerLine(line, columns)}\n`, 'ascii'));
      }
    }
  }

  if (settings.showBusinessName || contactLines.length > 0) {
    commands.push(...Buffer.from(`${divider}\n`, 'ascii'));
  }

  commands.push(0x1b, 0x61, 0x01);
  commands.push(0x1d, 0x21, 0x11);
  commands.push(...Buffer.from(`${centerLine('KITCHEN TICKET', Math.floor(columns / 2))}\n\n`, 'ascii'));
  commands.push(0x1d, 0x21, 0x00);
  commands.push(0x1b, 0x61, 0x00);

  const formattedDate = new Date(order.createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  commands.push(...Buffer.from(`Table: #${ascii(order.tableNumber)}\n`, 'ascii'));

  // The operator name, timestamp and reference are the kitchen ticket's
  // counterparts of the receipt's Cashier / Date / Receipt # rows, so the
  // owner's "show on receipt" toggles gate them here too.
  if (settings.showCashierName) {
    commands.push(...Buffer.from(`Waiter: ${ascii(order.waiterName || 'Staff')}\n`, 'ascii'));
  }
  if (settings.showDateTime) {
    commands.push(...Buffer.from(`Time: ${formattedDate}\n`, 'ascii'));
  }
  if (settings.showReceiptNumber) {
    commands.push(...Buffer.from(`Order Ref: ${order.clientOrderId.slice(0, 8)}\n`, 'ascii'));
  }
  commands.push(...Buffer.from(`${divider}\n`, 'ascii'));
  commands.push(...Buffer.from('QTY  ITEM\n', 'ascii'));
  commands.push(...Buffer.from(`${divider}\n`, 'ascii'));

  const nameWidth = Math.max(8, columns - 5);
  for (const item of order.items) {
    const qtyStr = `${item.quantity}x`.padEnd(5, ' ');
    const nameStr = ascii(item.name).padEnd(nameWidth, ' ').slice(0, nameWidth);
    commands.push(...Buffer.from(`${qtyStr}${nameStr}\n`, 'ascii'));
    if (item.notes && item.notes.trim()) {
      for (const line of wrapLine(`  -> Note: ${item.notes}`, columns)) {
        commands.push(...Buffer.from(`${line}\n`, 'ascii'));
      }
    }
  }

  commands.push(...Buffer.from(`${divider}\n`, 'ascii'));

  // Footer messages are part of the configured layout, so keep them centred
  // and wrapped to the paper — a 58mm roll cuts off anything wider.
  const footer = [settings.bottomMessage, settings.secondaryBottomMessage]
    .map((message) => message.trim())
    .filter(Boolean);
  if (footer.length > 0) {
    commands.push(0x1b, 0x61, 0x01);
    for (const message of footer) {
      for (const line of wrapLine(message, columns)) {
        commands.push(...Buffer.from(`${centerLine(line, columns)}\n`, 'ascii'));
      }
    }
    commands.push(0x1b, 0x61, 0x00);
  }

  commands.push(0x0a);
  commands.push(0x1d, 0x56, 0x42, 0x00); // cut

  return Buffer.from(commands);
}

/** The diagnostic slip behind Test Print, using the same configured layout. */
export function buildEscPosTestSlip(
  transportLabel: string,
  settings: ReceiptSettings = DEFAULT_RECEIPT_SETTINGS,
): Buffer {
  const columns = ticketColumns(settings);
  const commands: number[] = [0x1b, 0x40, 0x1b, 0x61, 0x01];

  if (settings.showBusinessName && settings.businessName.trim()) {
    for (const line of wrapLine(settings.businessName, columns)) {
      commands.push(...Buffer.from(`${centerLine(line, columns)}\n`, 'ascii'));
    }
  }

  commands.push(0x1d, 0x21, 0x11);
  commands.push(...Buffer.from(`${centerLine('TEST PRINT', Math.floor(columns / 2))}\n\n`, 'ascii'));
  commands.push(0x1d, 0x21, 0x00);
  commands.push(
    ...Buffer.from(
      `${centerLine(`If you can read this, ${transportLabel} printing is working.`, columns)}\n\n`,
      'ascii',
    ),
  );

  const footer = [settings.bottomMessage, settings.secondaryBottomMessage]
    .map((message) => message.trim())
    .filter(Boolean);
  for (const message of footer) {
    for (const line of wrapLine(message, columns)) {
      commands.push(...Buffer.from(`${centerLine(line, columns)}\n`, 'ascii'));
    }
  }

  commands.push(0x0a, 0x0a, 0x1d, 0x56, 0x42, 0x00);
  return Buffer.from(commands);
}

/**
 * Turns a raw printing error into a short, human sentence. Floor staff should
 * never have to read "navigator.bluetooth.getDevices is not supported in this
 * browser" — they only need to know the ticket didn't print and what to do.
 */
const PLAIN_PRINT_REASONS: Array<{ match: RegExp; text: string }> = [
  // Claim contention comes first: Chromium's wording contains "interface",
  // which the generic device rules would otherwise claim.
  { match: /claim|another window|another program|in use/i, text: 'another window or program is using the printer' },
  // The rules below also match the sentences this function produces, so
  // normalising an already-normalised error is safe.
  { match: /paper jam|jammed/i, text: 'there is a paper jam in the printer' },
  { match: /out of paper|no paper|paper out|paper end|paper/i, text: 'the printer is out of paper' },
  { match: /cover open|lid open|cover is open/i, text: "the printer's cover is open" },
  { match: /stopped responding|accepted no data|timeout|timed out|did not respond/i, text: 'the printer stopped responding' },
  { match: /unplug|disconnect|device was lost|lost its connection|cable/i, text: 'the printer was disconnected' },
  { match: /not allowed|permission|denied|security|blocked/i, text: 'this terminal is not allowed to use the printer' },
  { match: /no device selected|no printer was selected|chooser|cancelled|canceled/i, text: 'no printer was selected' },
  { match: /switched off|turned off|powered off|power off/i, text: 'the printer is switched off' },
  { match: /no printer|not configured|not set.?up/i, text: 'no printer is set up for this terminal' },
  { match: /bulk out|not support|unsupported|no endpoint|endpoint|not accept|does not accept/i, text: 'the printer does not accept ticket data' },
  { match: /bluetooth|getDevices|WebBluetooth/i, text: 'the printer is not connected to this device' },
  { match: /usb|WebUSB/i, text: 'the USB printer is not connected' },
  { match: /not found|not permitted|pair/i, text: 'this device does not know the printer yet' },
  { match: /transfer|write failed/i, text: 'the printer did not accept the ticket' },
  { match: /offline|not reachable|unreachable|refused|network|socket|ECONN|EHOST|ENOTFOUND/i, text: 'the printer is not reachable' },
];

export function humanizePrintReason(reason?: string | null): string {
  if (!reason) return 'the printer did not answer';
  for (const rule of PLAIN_PRINT_REASONS) {
    if (rule.match.test(reason)) return rule.text;
  }
  return 'the printer did not answer';
}

/** A complete plain-English sentence for a socket payload or job record. */
export function printFailureSentence(reason?: string | null): string {
  const clause = humanizePrintReason(reason);
  return `${clause.charAt(0).toUpperCase()}${clause.slice(1)}.`;
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
    // Carry the cause so the cashier's banner can name it, not just say that
    // something failed.
    error: printFailureSentence(reason),
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

  const settings = await getReceiptSettings();
  const ticketBuffer = buildEscPosKitchenTicket(order, settings);
  const payloadBase64 = ticketBuffer.toString('base64');

  // "Number of Copies" is a layout setting: queue one job per copy so the
  // existing USB/Bluetooth/network paths print each without special-casing a
  // repeat command (ESC/POS has no portable one).
  let firstJob: Awaited<ReturnType<typeof tx.printJob.create>> | null = null;
  for (let copy = 0; copy < settings.copies; copy += 1) {
    const job = await tx.printJob.create({
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
    if (!firstJob) firstJob = job;
  }

  return firstJob;
}

