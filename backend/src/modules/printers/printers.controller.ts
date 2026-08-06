import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import {
  getPrinterRegistry,
  invalidatePrinterCache,
} from '../../services/printer.service';
import { prisma } from '../../services/prisma.service';
import { sendTicketToPrinterTCP } from '../../services/printer.service';

export async function getPrinters(req: AuthenticatedRequest, res: Response) {
  const printers = await getPrinterRegistry();
  res.setHeader('Cache-Control', 'private, max-age=60');
  return res.json(printers);
}

export async function updatePrinters(req: AuthenticatedRequest, res: Response) {
  const { stations } = req.body;
  if (!Array.isArray(stations)) {
    return res.status(400).json({ error: 'Expected stations array.' });
  }

  await prisma.$transaction([
    prisma.printerStation.deleteMany(),
    ...stations.map((s: { station: string; ip: string; port: number }) =>
      prisma.printerStation.create({
        data: { station: s.station, ip: s.ip, port: s.port ?? 9100 },
      })
    ),
  ]);

  invalidatePrinterCache();
  const updated = await getPrinterRegistry();
  return res.json(updated);
}

export async function updatePrinter(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const updates = req.body;

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
    },
  });

  invalidatePrinterCache();
  return res.json({
    id: updated.id,
    station: updated.station,
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
  const printers = await getPrinterRegistry();
  const printer = printers.find((p) => p.station === id || p.id === id);

  if (!printer) return res.status(404).json({ error: 'Printer not found.' });

  const buffer = Buffer.from([
    0x1b, 0x40,
    ...Buffer.from('*** TEST PRINT ***\n\nIf you can read this, TCP connection is working.\n\n\n\n', 'ascii'),
    0x1d, 0x56, 0x42, 0x00,
  ]);

  try {
    const success = await sendTicketToPrinterTCP(printer.ip, printer.port, buffer, 0);
    if (success) {
      return res.json({ message: 'Test print sent successfully.' });
    }
    return res.status(502).json({ error: 'TCP connection to printer failed.' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'TCP error';
    return res.status(502).json({ error: message });
  }
}
