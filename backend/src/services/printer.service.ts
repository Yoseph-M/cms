import net from 'net';
import { logger } from '../utils/logger';
import { emitToLiveOrders } from './socket.service';

export interface PrinterStation {
  id?: string;
  station: 'kitchen' | 'bar' | 'cashier';
  ip: string;
  port: number;
}

// In-memory printer registry (can be overridden via API)
let printerRegistry: PrinterStation[] = [
  { station: 'kitchen', ip: '192.168.1.100', port: 9100 },
  { station: 'bar', ip: '192.168.1.101', port: 9100 },
  { station: 'cashier', ip: '192.168.1.102', port: 9100 },
];

export function getPrinterRegistry(): PrinterStation[] {
  return printerRegistry;
}

export function updatePrinterRegistry(stations: PrinterStation[]): PrinterStation[] {
  printerRegistry = stations;
  return printerRegistry;
}

// Track printers that have failed to emit recovery events later
const failedPrinters = new Set<string>();

/**
 * Builds raw ESC/POS byte commands for thermal ticket printing.
 */
export function buildEscPosKitchenTicket(order: {
  clientOrderId: string;
  tableNumber: string;
  waiterName?: string;
  createdAt: Date | string;
  items: Array<{ name: string; quantity: number; notes?: string }>;
}): Buffer {
  const commands: number[] = [];

  // Initialize printer: ESC @ (0x1B, 0x40)
  commands.push(0x1b, 0x40);

  // Center align text: ESC a 1
  commands.push(0x1b, 0x61, 0x01);

  // Double size header: GS ! 0x11
  commands.push(0x1d, 0x21, 0x11);
  commands.push(...Buffer.from('=== KITCHEN TICKET ===\n\n', 'ascii'));

  // Normal text size: GS ! 0x00
  commands.push(0x1d, 0x21, 0x00);
  // Left align: ESC a 0
  commands.push(0x1b, 0x61, 0x00);

  const formattedDate = new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  commands.push(...Buffer.from(`Table: #${order.tableNumber}\n`, 'ascii'));
  commands.push(...Buffer.from(`Waiter: ${order.waiterName || 'Staff'}\n`, 'ascii'));
  commands.push(...Buffer.from(`Time: ${formattedDate}\n`, 'ascii'));
  commands.push(...Buffer.from(`Order Ref: ${order.clientOrderId.slice(0, 8)}\n`, 'ascii'));
  commands.push(...Buffer.from('--------------------------------\n', 'ascii'));

  // Items
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

  // Cut paper: GS V 66 0
  commands.push(0x1d, 0x56, 0x42, 0x00);

  return Buffer.from(commands);
}

/**
 * Pushes ESC/POS ticket bytes over TCP socket with 2 backoff retries.
 * Non-blocking: logs failures gracefully without throwing.
 */
export async function sendTicketToPrinterTCP(
  ip: string,
  port: number,
  ticketBuffer: Buffer,
  retriesLeft = 2
): Promise<boolean> {
  return new Promise((resolve) => {
    const client = new net.Socket();
    let isFinished = false;

    client.setTimeout(3000); // 3 sec timeout

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
        logger.error({ ip, port }, 'All retries exhausted for TCP printer push. Logging for reconciliation.');
        failedPrinters.add(`${ip}:${port}`);
        resolve(false);
      }
    };

    client.on('timeout', () => handleFailure('Socket Timeout'));
    client.on('error', (err) => handleFailure(err));
  });
}

/**
 * Triggers automated kitchen ticket printing for an order asynchronously.
 */
export function triggerKitchenPrint(order: {
  id: string;
  clientOrderId: string;
  tableNumber: string;
  waiterName?: string;
  createdAt: Date | string;
  items: Array<{ name: string; quantity: number; notes?: string }>;
}) {
  const kitchenPrinter = printerRegistry.find((p) => p.station === 'kitchen');
  if (!kitchenPrinter) {
    logger.warn('No kitchen printer configured in registry.');
    return;
  }

  const ticketBuffer = buildEscPosKitchenTicket(order);

  // Fire-and-forget background execution
  sendTicketToPrinterTCP(kitchenPrinter.ip, kitchenPrinter.port, ticketBuffer).then((success) => {
    if (!success) {
      emitToLiveOrders('printer:failed', {
        id: order.id,
        clientOrderId: order.clientOrderId,
        tableNumber: order.tableNumber,
        message: 'Kitchen printer TCP connection failed after retries.'
      });
    }
  }).catch((err) => {
    logger.error({ err }, 'Background kitchen print error.');
    emitToLiveOrders('printer:failed', {
      id: order.id,
      clientOrderId: order.clientOrderId,
      tableNumber: order.tableNumber,
      message: 'Background kitchen print error.'
    });
  });
}
