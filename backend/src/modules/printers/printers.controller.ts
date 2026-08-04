import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { getPrinterRegistry, updatePrinterRegistry } from '../../services/printer.service';

export async function getPrinters(req: AuthenticatedRequest, res: Response) {
  const printers = getPrinterRegistry();
  return res.json(printers);
}

export async function updatePrinters(req: AuthenticatedRequest, res: Response) {
  const { stations } = req.body;
  if (!Array.isArray(stations)) {
    return res.status(400).json({ error: 'Expected stations array.' });
  }

  const updated = updatePrinterRegistry(stations);
  return res.json(updated);
}

export async function updatePrinter(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const updates = req.body;
  const printers = getPrinterRegistry();
  const idx = printers.findIndex(p => p.station === id || p.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Printer not found.' });

  printers[idx] = { ...printers[idx], ...updates };
  updatePrinterRegistry(printers);
  return res.json(printers[idx]);
}

export async function deletePrinter(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const printers = getPrinterRegistry();
  const filtered = printers.filter(p => p.station !== id && p.id !== id);
  if (filtered.length === printers.length) return res.status(404).json({ error: 'Printer not found.' });

  updatePrinterRegistry(filtered);
  return res.status(204).send();
}

import { sendTicketToPrinterTCP } from '../../services/printer.service';

export async function testPrint(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const printers = getPrinterRegistry();
  const printer = printers.find(p => p.station === id || p.id === id);
  
  if (!printer) return res.status(404).json({ error: 'Printer not found.' });

  // Minimal test ESC/POS buffer
  const buffer = Buffer.from([
    0x1b, 0x40, // Init
    ...Buffer.from('*** TEST PRINT ***\n\nIf you can read this, TCP connection is working.\n\n\n\n', 'ascii'),
    0x1d, 0x56, 0x42, 0x00 // Cut
  ]);

  try {
    const success = await sendTicketToPrinterTCP(printer.ip, printer.port, buffer, 0); // No retries for test
    if (success) {
      return res.json({ message: 'Test print sent successfully.' });
    } else {
      return res.status(502).json({ error: 'TCP connection to printer failed.' });
    }
  } catch (err: any) {
    return res.status(502).json({ error: err.message || 'TCP error' });
  }
}
