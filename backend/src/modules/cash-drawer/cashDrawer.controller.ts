import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { prisma } from '../../services/prisma.service';
import { recordAudit } from '../../services/audit.service';

function requestedDay(req: AuthenticatedRequest) {
  const date = String(req.query.date ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const from = new Date(String(req.query.from ?? ''));
  const to = new Date(String(req.query.to ?? ''));
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to || to.getTime() - from.getTime() > 26 * 60 * 60 * 1000) return null;
  return { date, from, to };
}

export async function getCashDrawer(req: AuthenticatedRequest, res: Response) {
  const day = requestedDay(req);
  if (!day) return res.status(400).json({ error: 'Provide a business date and valid local-day boundaries.' });
  const [entries, cashSettlements] = await Promise.all([
    prisma.cashDrawerEntry.findMany({
      where: { businessDate: day.date },
      include: { createdBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' }, take: 200,
    }),
    prisma.settlement.findMany({
      where: { method: 'CASH', recordedAt: { gte: day.from, lt: day.to } },
      select: { amountMinor: true },
    }),
  ]);
  const sum = (type: string) => entries.filter((entry) => entry.type === type).reduce((total, entry) => total + entry.amount, 0);
  const openingFloat = sum('OPENING_FLOAT');
  const cashSales = cashSettlements.reduce((total, settlement) => total + settlement.amountMinor, 0);
  const cashIn = sum('CASH_IN');
  const cashOut = sum('CASH_OUT');
  const pettyCash = sum('PETTY_CASH');
  const adjustments = sum('ADJUSTMENT');
  return res.json({
    businessDate: day.date,
    openingFloat,
    cashSales,
    cashIn,
    cashOut,
    pettyCash,
    adjustments,
    expectedBalance: openingFloat + cashSales + cashIn - cashOut - pettyCash + adjustments,
    entries,
  });
}

export async function createCashDrawerEntry(req: AuthenticatedRequest, res: Response) {
  const { businessDate, type, amount, description, reference, idempotencyKey } = req.body;
  if (idempotencyKey) {
    const replay = await prisma.cashDrawerEntry.findUnique({ where: { idempotencyKey }, include: { createdBy: { select: { id: true, name: true } } } });
    if (replay) return res.status(200).json({ isNew: false, entry: replay });
  }
  if (type === 'OPENING_FLOAT') {
    const opening = await prisma.cashDrawerEntry.findFirst({ where: { businessDate, type: 'OPENING_FLOAT' }, select: { id: true } });
    if (opening) return res.status(409).json({ error: 'An opening float is already recorded for this business day.' });
  }
  let entry;
  try {
    entry = await prisma.cashDrawerEntry.create({
      data: { businessDate, type, amount, description, reference, idempotencyKey, openingFloatKey: type === 'OPENING_FLOAT' ? `OPENING-${businessDate}` : null, createdById: req.user!.userId },
      include: { createdBy: { select: { id: true, name: true } } },
    });
  } catch (error: any) {
    if (error?.code === 'P2002') return res.status(409).json({ error: 'This drawer entry has already been recorded.' });
    throw error;
  }
  void recordAudit({ actorId: req.user!.userId, actionType: 'CASH_DRAWER_ENTRY_CREATED', targetType: 'CashDrawerEntry', targetId: entry.id, details: { businessDate, type, amount, reference } });
  return res.status(201).json({ isNew: true, entry });
}
