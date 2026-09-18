/**
 * Backfill: cancelled orders → void settlements
 *
 * Cancelled orders (manual, approved requests, or auto-cancelled by the
 * background "no settlement within N hours" job) used to disappear from the
 * books entirely: no settlement row was written, so they never showed on the
 * Settlements page.
 *
 * New cancellations now write a VOID settlement automatically. This script
 * brings *historical* ones in line: every CANCELLED order with no VOID
 * settlement gets one.
 *
 * Idempotent: orders that already have a VOID settlement are skipped, so
 * re-running is a no-op. Back up your database before running it.
 *
 * Usage:
 *   cd backend
 *   npx tsx scripts/backfill-auto-cancel-settlements.ts
 */

import { PrismaClient, PaymentMethod, OrderStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const cancelled = await prisma.order.findMany({
    where: { status: OrderStatus.CANCELLED },
    select: {
      id: true,
      totalAmount: true,
      cancelledById: true,
      cashierId: true,
      waiterId: true,
      cancellationReason: true,
    },
  });

  console.log(`Checking ${cancelled.length} cancelled order(s)…`);

  let created = 0;
  let skipped = 0;

  for (const order of cancelled) {
    const existing = await prisma.settlement.findFirst({
      where: { orderId: order.id, reference: 'VOID' },
      select: { id: true },
    });
    if (existing) {
      skipped += 1;
      continue;
    }

    // Attribute the void to whoever cancelled the order when known; otherwise
    // fall back to the order's staff so the required relation still resolves.
    const recordedById = order.cancelledById ?? order.cashierId ?? order.waiterId;
    if (!recordedById) {
      console.warn(`Skipping order ${order.id}: no cancelledBy/cashier/waiter to attribute the void to.`);
      skipped += 1;
      continue;
    }

    await prisma.settlement.create({
      data: {
        orderId: order.id,
        amountMinor: Math.max(order.totalAmount, 0),
        method: PaymentMethod.NONE,
        reference: 'VOID',
        note: order.cancellationReason ? `Cancelled: ${order.cancellationReason}` : 'Cancelled',
        recordedById,
      },
    });
    created += 1;
  }

  console.log(`Done. Created ${created} void settlement(s); ${skipped} skipped.`);
}

main()
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
