import { PrismaClient } from '@prisma/client';

/** Restore sale deductions exactly once when an unsettled order is cancelled. */
export async function restoreCancelledOrderStock(
  tx: PrismaClient,
  orderId: string,
  actorId: string,
) {
  const saleMovements = await tx.stockMovement.findMany({
    where: { reference: orderId, reason: 'SALE' },
  });
  if (saleMovements.length === 0) return;

  const alreadyRestored = await tx.stockMovement.findFirst({
    where: { reference: orderId, reason: 'CANCELLATION' },
    select: { id: true },
  });
  if (alreadyRestored) return;

  for (const movement of saleMovements) {
    const item = await tx.menuItem.findUnique({ where: { id: movement.menuItemId } });
    if (!item) continue;
    const quantity = Math.abs(movement.delta);
    await tx.menuItem.update({
      where: { id: movement.menuItemId },
      data: { stockQuantity: { increment: quantity } },
    });
    await tx.stockMovement.create({
      data: {
        menuItemId: movement.menuItemId,
        delta: quantity,
        reason: 'CANCELLATION',
        reference: orderId,
        performedById: actorId,
      },
    });
  }
}
