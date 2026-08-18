import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import {
  getPrinterRegistry,
  invalidatePrinterCache,
} from '../../services/printer.service';
import { prisma } from '../../services/prisma.service';
import { sendTicketToPrinterTCP } from '../../services/printer.service';
import { recordAudit } from '../../services/audit.service';
import { logger } from '../../utils/logger';

export async function getPrinters(req: AuthenticatedRequest, res: Response) {
  const printers = await getPrinterRegistry();
  res.setHeader('Cache-Control', 'private, max-age=60');
  return res.json(printers);
}

export async function updatePrinters(req: AuthenticatedRequest, res: Response) {
  const { stations } = req.body;
  const userId = req.user!.userId;

  if (!Array.isArray(stations)) {
    return res.status(400).json({ error: 'Expected stations array.' });
  }

  // Validate station data
  for (const s of stations) {
    if (!s.station || typeof s.station !== 'string') {
      return res.status(400).json({ error: 'Each station must have a valid station name' });
    }
    if (s.transport === 'TCP') {
      if (!s.ip || typeof s.ip !== 'string') {
        return res.status(400).json({ error: 'TCP transport requires valid IP address' });
      }
      // Basic IP validation
      const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
      if (!ipRegex.test(s.ip)) {
        return res.status(400).json({ error: `Invalid IP address format: ${s.ip}` });
      }
    } else if (s.transport === 'WINDOWS') {
      if (!s.printerName || typeof s.printerName !== 'string') {
        return res.status(400).json({ error: 'WINDOWS transport requires valid printer name' });
      }
    }
  }

  await prisma.$transaction([
    prisma.printerStation.deleteMany(),
    ...stations.map((s: { station: string; transport?: string; ip?: string | null; port?: number | null; printerName?: string | null }) =>
      prisma.printerStation.create({
        data: {
          station: s.station,
          transport: (s.transport as any) ?? 'TCP',
          ip: s.ip ?? null,
          port: s.port ?? (s.transport === 'WINDOWS' ? null : 9100),
          printerName: s.printerName ?? null,
        },
      })
    ),
  ]);

  // Audit printer configuration change
  await recordAudit({
    actorId: userId,
    actionType: 'PRINTER_CONFIG_UPDATE',
    targetType: 'PrinterStation',
    details: { stations: stations.map(s => ({ station: s.station, transport: s.transport })) },
  });

  logger.info({ userId, stationCount: stations.length }, 'Printer configuration updated');

  invalidatePrinterCache();
  const updated = await getPrinterRegistry();
  return res.json(updated);
}

export async function updatePrinter(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const updates = req.body;
  const userId = req.user!.userId;

  // Validate updates
  if (updates.transport === 'TCP' && updates.ip) {
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(updates.ip)) {
      return res.status(400).json({ error: 'Invalid IP address format' });
    }
  }

  const existing = await prisma.printerStation.findFirst({
    where: { OR: [{ id }, { station: id }] },
  });
  if (!existing) return res.status(404).json({ error: 'Printer not found.' });

  const updated = await prisma.printerStation.update({
    where: { id: existing.id },
    data: {
      ...(updates.ip !== undefined && { ip: updates.ip }),
      ...(updates.port !== undefined && { port: updates.port }),
      ...(updates.station !== undefined && { station: updates.station }),
      ...(updates.transport !== undefined && { transport: updates.transport }),
      ...(updates.printerName !== undefined && { printerName: updates.printerName }),
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
    ip: updated.ip,
    port: updated.port,
    printerName: updated.printerName,
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

  if (printer.transport === 'WINDOWS') {
    // For Windows printers, enqueue a test print job for the agent to pick up
    const buffer = Buffer.from([
      0x1b, 0x40,
      ...Buffer.from('*** TEST PRINT ***\n\nIf you can read this, Windows Print Agent is working.\n\n\n\n', 'ascii'),
      0x1d, 0x56, 0x42, 0x00,
    ]);
    await prisma.printJob.create({
      data: {
        station: printer.station,
        transport: 'WINDOWS',
        printerName: printer.printerName,
        payloadBase64: buffer.toString('base64'),
      },
    });
    return res.json({ message: 'Test print job queued for Windows Print Agent.' });
  }

  // TCP test print
  const buffer = Buffer.from([
    0x1b, 0x40,
    ...Buffer.from('*** TEST PRINT ***\n\nIf you can read this, TCP connection is working.\n\n\n\n', 'ascii'),
    0x1d, 0x56, 0x42, 0x00,
  ]);

  try {
    const success = await sendTicketToPrinterTCP(printer.ip!, printer.port!, buffer, 0);
    if (success) {
      return res.json({ message: 'Test print sent successfully.' });
    }
    return res.status(502).json({ error: 'TCP connection to printer failed.' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'TCP error';
    logger.error({ err, station: printer.station }, 'Test print failed');
    return res.status(502).json({ error: message });
  }
}
