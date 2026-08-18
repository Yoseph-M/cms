import net from 'net';
import { logger } from '../utils/logger';
import { emitToLiveOrders } from './socket.service';
import { createNotification } from './notification.service';
import { prisma } from './prisma.service';
import { getCached, setCache, invalidateCache } from './cache.service';
import { PrismaClient, PrintJobStatus, PrintTransport } from '@prisma/client';

export interface PrinterStation {
  id?: string;
  station: 'kitchen' | 'bar' | 'cashier';
  transport: PrintTransport;
  ip: string | null;
  port: number | null;
  printerName: string | null;
}

const PRINTER_CACHE_KEY = 'printers:all';
const PRINTER_CACHE_TTL_MS = 60_000;

const failedPrinters = new Set<string>();

async function loadPrintersFromDb(): Promise<PrinterStation[]> {
  const cached = getCached<PrinterStation[]>(PRINTER_CACHE_KEY);
  if (cached) return cached;

  const rows = await prisma.printerStation.findMany({ orderBy: { station: 'asc' } });
  const mapped = rows.map((r) => ({
    id: r.id,
    station: r.station as PrinterStation['station'],
    transport: r.transport,
    ip: r.ip,
    port: r.port,
    printerName: r.printerName,
  }));

  setCache(PRINTER_CACHE_KEY, mapped, PRINTER_CACHE_TTL_MS);
  return mapped;
}

export async function getPrinterRegistry(): Promise<PrinterStation[]> {
  return loadPrintersFromDb();
}

export function invalidatePrinterCache(): void {
  invalidateCache(PRINTER_CACHE_KEY);
}

export async function ensureDefaultPrinters(): Promise<void> {
  const count = await prisma.printerStation.count();
  if (count > 0) return;

  await prisma.printerStation.createMany({
    data: [
      { station: 'kitchen', ip: '192.168.1.100', port: 9100, transport: PrintTransport.TCP },
      { station: 'bar', ip: '192.168.1.101', port: 9100, transport: PrintTransport.TCP },
      { station: 'cashier', ip: '192.168.1.102', port: 9100, transport: PrintTransport.TCP },
    ],
  });
  invalidatePrinterCache();
  logger.info('Seeded default printer stations.');
}

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

export async function sendTicketToPrinterTCP(
  ip: string,
  port: number,
  ticketBuffer: Buffer,
  retriesLeft = 2
): Promise<boolean> {
  return new Promise((resolve) => {
    const client = new net.Socket();
    let isFinished = false;

    client.setTimeout(3000);

    client.connect(port, ip, () => {
      logger.info({ ip, port }, 'Connected to thermal printer via TCP; sending payload.');
      client.write(ticketBuffer, () => {
        client.end();
      });
    });

    client.on('end', () => {
      if (!isFinished) {
        isFinished = true;
        logger.info({ ip, port }, 'Successfully pushed print job to printer.');
        const printerKey = `${ip}:${port}`;
        if (failedPrinters.has(printerKey)) {
          failedPrinters.delete(printerKey);
          emitToLiveOrders('printer:recovered', { ip, port, message: `Printer ${ip} recovered.` });
        }
        resolve(true);
      }
    });

    const handleFailure = async (err: Error | string) => {
      if (isFinished) return;
      isFinished = true;
      client.destroy();

      logger.warn({ ip, port, error: err, retriesLeft }, 'TCP printer push failed.');

      if (retriesLeft > 0) {
        logger.info({ retriesLeft }, 'Retrying TCP printer push with 1s backoff...');
        await new Promise((res) => setTimeout(res, 1000));
        const retrySuccess = await sendTicketToPrinterTCP(ip, port, ticketBuffer, retriesLeft - 1);
        resolve(retrySuccess);
      } else {
        logger.error({ ip, port }, 'All retries exhausted for TCP printer push.');
        failedPrinters.add(`${ip}:${port}`);
        resolve(false);
      }
    };

    client.on('timeout', () => handleFailure('Socket Timeout'));
    client.on('error', (err) => handleFailure(err));
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
  const kitchenPrinter = printers.find((p) => p.station === 'kitchen');
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
      printerName: kitchenPrinter.printerName,
      printerIp: kitchenPrinter.ip,
      printerPort: kitchenPrinter.port,
      payloadBase64,
      status: PrintJobStatus.QUEUED,
    },
  });

  return printJob;
}

export async function processTCPPrintJob(jobId: string) {
  const job = await prisma.printJob.findUnique({ where: { id: jobId } });
  if (!job || job.transport !== PrintTransport.TCP || job.status !== PrintJobStatus.QUEUED) {
    return;
  }

  if (!job.printerIp || !job.printerPort) {
    logger.error('TCP print job missing IP or Port');
    return;
  }

  // Claim job locally for backend TCP processing
  const claimed = await prisma.printJob.updateMany({
    where: { id: jobId, status: PrintJobStatus.QUEUED },
    data: { status: PrintJobStatus.PRINTING },
  });

  if (claimed.count === 0) return; // Already claimed or not queued

  const ticketBuffer = Buffer.from(job.payloadBase64, 'base64');
  
  try {
    const success = await sendTicketToPrinterTCP(job.printerIp, job.printerPort, ticketBuffer);
    if (success) {
      await prisma.printJob.update({
        where: { id: jobId },
        data: { status: PrintJobStatus.PRINTED, printedAt: new Date() },
      });
    } else {
      await prisma.printJob.update({
        where: { id: jobId },
        data: { status: PrintJobStatus.FAILED, lastError: 'TCP Connection Failed' },
      });
      emitToLiveOrders('printer:failed', {
        id: job.orderId,
        message: 'Kitchen printer TCP connection failed after retries.',
      });
      if (job.orderId) {
        void createNotification({
          type: 'PRINTER_FAILURE',
          severity: 'critical',
          message: `TCP printer failed for station ${job.station}.`,
          relatedId: job.orderId,
        });
      }
    }
  } catch (err: any) {
    logger.error({ err }, 'Background kitchen print error.');
    await prisma.printJob.update({
      where: { id: jobId },
      data: { status: PrintJobStatus.FAILED, lastError: err.message || 'Unknown Error' },
    });
  }
}
