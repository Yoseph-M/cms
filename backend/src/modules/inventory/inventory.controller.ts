import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { prisma } from '../../services/prisma.service';
import { executeInCriticalTransaction } from '../../utils/transaction';

export async function getInventory(req: AuthenticatedRequest, res: Response) {
  const lowOnly = req.query.lowOnly === 'true';
  const items = await prisma.menuItem.findMany({
    where: { trackInventory: true },
    orderBy: { name: 'asc' },
  });
  const visibleItems = lowOnly
    ? items.filter((item) => (item.stockQuantity ?? 0) <= (item.lowStockThreshold ?? 5))
    : items;
  return res.json(visibleItems);
}

export async function getStockMovements(req: AuthenticatedRequest, res: Response) {
  const itemId = req.query.menuItemId as string | undefined;
  const movements = await prisma.stockMovement.findMany({
    where: itemId ? { menuItemId: itemId } : undefined,
    include: { menuItem: { select: { id: true, name: true, nameAmharic: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return res.json(movements);
}

export async function adjustStock(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const { delta, reason, reference } = req.body;
  const actorId = req.user!.userId;
  const item = await prisma.menuItem.findUnique({ where: { id } });
  if (!item) return res.status(404).json({ error: 'Menu item not found.' });
  if (!item.trackInventory) return res.status(400).json({ error: 'Inventory tracking is not enabled for this item.' });

  try {
    const result = await executeInCriticalTransaction(prisma, async (tx) => {
      const changed = await tx.menuItem.updateMany({
        where: {
          id,
          trackInventory: true,
          ...(delta < 0 ? { stockQuantity: { gte: -delta } } : {}),
        },
        data: { stockQuantity: { increment: delta } },
      });
      if (changed.count === 0) throw new Error('INSUFFICIENT_OR_CHANGED_STOCK');

      const movement = await tx.stockMovement.create({
        data: { menuItemId: id, delta, reason, reference: reference || null, performedById: actorId },
      });
      const updated = await tx.menuItem.findUnique({ where: { id } });
      return { item: updated, movement };
    });
    return res.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === 'INSUFFICIENT_OR_CHANGED_STOCK') {
      return res.status(409).json({ error: 'Stock changed or the adjustment would make inventory negative. Refresh and try again.' });
    }
    throw error;
  }
}

