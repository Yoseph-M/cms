import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import {
  getPrinterRegistry,
  invalidatePrinterCache,
  sendToNetworkPrinter,
} from '../../services/printer.service';
import { prisma } from '../../services/prisma.service';

import { recordAudit } from '../../services/audit.service';
import { logger } from '../../utils/logger';

export async function getPrinters(req: AuthenticatedRequest, res: Response) {
  const printers = await getPrinterRegistry();
  return res.json(printers);
}

interface IncomingStation {
  station?: unknown;
  transport?: string;
  macAddress?: string | null;
  vendorId?: string | null;
  productId?: string | null;
  ip?: string | null;
  port?: number | null;
}

const MAC_ADDRESS = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
// Web Bluetooth never exposes a device's MAC address, so "Scan for Bluetooth
// printers" stores the browser's opaque per-origin device id (a base64-ish
// token) instead. Accept that too — requiring a MAC made every scanned printer
// unsavable, because the scan can't produce one.
const WEB_BLUETOOTH_DEVICE_ID = /^[A-Za-z0-9+/_=-]{4,64}$/;

function isUsableBluetoothIdentifier(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return MAC_ADDRESS.test(trimmed) || WEB_BLUETOOTH_DEVICE_ID.test(trimmed);
}

export async function updatePrinters(req: AuthenticatedRequest, res: Response) {
  const { stations } = req.body;
  const userId = req.user!.userId;

  if (!Array.isArray(stations)) {
    return res.status(400).json({ error: 'Expected stations array.' });
  }

  // Printers are plain devices in the UI — nobody picks a "station" any more.
  // Position gives the routing key: the first printer in the list is the ticket
  // printer (`kitchen`), the rest get a positional key. An explicitly supplied
  // station name from an older client is kept when it is still free.
  const usedStations = new Set<string>();
  const normalized = (stations as IncomingStation[]).map((s, index) => {
    const requested = typeof s.station === 'string' ? s.station.trim() : '';
    const fallback = index === 0 ? 'kitchen' : `printer-${index + 1}`;
    let station = requested && !usedStations.has(requested) ? requested : fallback;
    while (usedStations.has(station)) station = `${station}-${index + 1}`;
    usedStations.add(station);
    return { ...s, station };
  });

  // Validate station data
  for (const s of normalized) {
    if (s.transport === 'BLUETOOTH') {
      if (!isUsableBluetoothIdentifier(s.macAddress)) {
        return res.status(400).json({
          error: 'BLUETOOTH transport requires the printer id from a scan, or its MAC address',
        });
      }
    } else if (s.transport === 'USB') {
      if (!s.vendorId || typeof s.vendorId !== 'string' || !s.productId || typeof s.productId !== 'string') {
        return res.status(400).json({ error: 'USB transport requires valid Vendor ID and Product ID' });
      }
    } else if (s.transport === 'NETWORK') {
      if (!s.ip || typeof s.ip !== 'string') {
        return res.status(400).json({ error: 'NETWORK transport requires the printer IP address' });
      }
      const ipv4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
      if (!ipv4.test(s.ip)) {
        return res.status(400).json({ error: `Invalid printer IP address: ${s.ip}` });
      }
      if (s.port !== undefined && s.port !== null && (!Number.isInteger(s.port) || s.port < 1 || s.port > 65535)) {
        return res.status(400).json({ error: `Invalid printer port: ${s.port}` });
      }
    }
  }

  await prisma.$transaction([
    prisma.printerStation.deleteMany(),
    ...normalized.map((s) =>
      prisma.printerStation.create({
        data: {
          station: s.station,
          transport: (s.transport as any) ?? 'BLUETOOTH',
          macAddress: s.macAddress ?? null,
          vendorId: s.vendorId ?? null,
          productId: s.productId ?? null,
          ip: s.ip ?? null,
          port: s.port ?? null,
        },
      })
    ),
  ]);

  // Audit printer configuration change
  await recordAudit({
    actorId: userId,
    actionType: 'PRINTER_CONFIG_UPDATE',
    targetType: 'PrinterStation',
    details: { stations: normalized.map((s) => ({ station: s.station, transport: s.transport })) },
  });

  logger.info({ userId, stationCount: normalized.length }, 'Printer configuration updated');

  invalidatePrinterCache();
  const updated = await getPrinterRegistry();
  return res.json(updated);
}

export async function updatePrinter(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const updates = req.body;
  const userId = req.user!.userId;

  // Validate updates
  if (updates.transport === 'BLUETOOTH' && updates.macAddress && !isUsableBluetoothIdentifier(updates.macAddress)) {
    return res.status(400).json({ error: `Invalid Bluetooth printer id: ${updates.macAddress}` });
  }

  const existing = await prisma.printerStation.findFirst({
    where: { OR: [{ id }, { station: id }] },
  });
  if (!existing) return res.status(404).json({ error: 'Printer not found.' });

  const updated = await prisma.printerStation.update({
    where: { id: existing.id },
    data: {
      ...(updates.macAddress !== undefined && { macAddress: updates.macAddress }),
      ...(updates.vendorId !== undefined && { vendorId: updates.vendorId }),
      ...(updates.productId !== undefined && { productId: updates.productId }),
      ...(updates.station !== undefined && { station: updates.station }),
      ...(updates.transport !== undefined && { transport: updates.transport }),
      ...(updates.ip !== undefined && { ip: updates.ip }),
      ...(updates.port !== undefined && { port: updates.port }),
    },
  });

  // Audit printer update
  await recordAudit({
    actorId: userId,
    actionType: 'PRINTER_UPDATE',
    targetType: 'PrinterStation',
    targetId: existing.id,
    details: { station: updated.station, transport: updated.transport },
  });

  logger.info({ userId, printerId: existing.id, station: updated.station }, 'Printer updated');

  invalidatePrinterCache();
  return res.json({
    id: updated.id,
    station: updated.station,
    transport: updated.transport,
    macAddress: updated.macAddress,
    vendorId: updated.vendorId,
    productId: updated.productId,
    ip: updated.ip,
    port: updated.port,
  });
}

export async function deletePrinter(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;

  const existing = await prisma.printerStation.findFirst({
    where: { OR: [{ id }, { station: id }] },
  });
  if (!existing) return res.status(404).json({ error: 'Printer not found.' });

  await prisma.printerStation.delete({ where: { id: existing.id } });
  invalidatePrinterCache();
  return res.status(204).send();
}

export async function testPrint(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const userId = req.user!.userId;

  const printers = await getPrinterRegistry();
  const printer = printers.find((p) => p.station === id || p.id === id);

  if (!printer) return res.status(404).json({ error: 'Printer not found.' });

  // Audit test print
  await recordAudit({
    actorId: userId,
    actionType: 'PRINTER_TEST',
    targetType: 'PrinterStation',
    targetId: printer.id,
    details: { station: printer.station, transport: printer.transport },
  });

  logger.info({ userId, station: printer.station, transport: printer.transport }, 'Test print requested');

  const buffer = Buffer.from([
    0x1b, 0x40,
    ...Buffer.from(`*** TEST PRINT ***\n\nIf you can read this, ${printer.transport} printing is working.\n\n\n\n`, 'ascii'),
    0x1d, 0x56, 0x42, 0x00,
  ]);

  if (printer.transport === 'NETWORK') {
    if (!printer.ip) {
      return res.status(400).json({ error: 'This network printer has no IP address configured.' });
    }
    try {
      await sendToNetworkPrinter(printer.ip, printer.port, buffer);
      return res.json({ message: `Test ticket sent to ${printer.ip}.` });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      logger.warn({ userId, station: printer.station, detail }, 'Network test print failed');
      return res.status(502).json({
        error: `Could not reach the printer at ${printer.ip}. Check that it is switched on and on the same network.`,
        details: detail,
      });
    }
  }

  if (printer.transport === 'BLUETOOTH' || printer.transport === 'USB') {
    // USB and Bluetooth printers belong to THIS browser: only the tab that has
    // the device paired can reach it, and pairing needs the user gesture behind
    // the button that is being clicked right now. Queueing the job instead meant
    // the click reported success while nothing came out of the printer, so hand
    // the terminal the encoded slip and let it print (see printTestSlip).
    return res.json({
      transport: printer.transport,
      printerMacAddress: printer.macAddress,
      printerVendorId: printer.vendorId,
      printerProductId: printer.productId,
      payloadBase64: buffer.toString('base64'),
    });
  }

  return res.status(400).json({ error: 'Unsupported transport.' });
}
