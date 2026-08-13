/**
 * Settlement Service
 * 
 * Handles external payment settlement recording.
 * The CMS does NOT process payments; it only records settlements
 * that occurred through external means (cash, card terminal, mobile payment, etc.)
 */

import { prisma } from './prisma.service';
import { recordAudit } from './audit.service';
import { PaymentMethod, SettlementStatus } from '@prisma/client';
import { executeInTransaction, checkOptimisticLock } from '../utils/transaction';

interface CreateSettlementParams {
  orderId: string;
  amountMinor: number;
  method: PaymentMethod;
  reference?: string;
  note?: string;
  recordedById: string;
  idempotencyKey?: string;
}

interface SettlementResult {
  settlement: any;
  order: any;
}

/**
 * Record an external settlement for an order
 * Implements atomic concurrency control and idempotency
 */
export async function recordSettlement(params: CreateSettlementParams): Promise<SettlementResult> {
  const { orderId, amountMinor, method, reference = '', note = '', recordedById, idempotencyKey } = params;

  // Idempotency check: if this key was already used, return the existing settlement
  if (idempotencyKey) {
    const existing = await prisma.settlement.findUnique({
      where: { idempotencyKey },
      include: { order: true },
    });
    if (existing) {
      return { settlement: existing, order: existing.order };
    }
  }

  // Validate amount
  if (amountMinor <= 0) {
    throw new Error('Settlement amount must be greater than zero');
  }

  // Validate payment method
  if (method === 'NONE') {
    throw new Error('Payment method cannot be NONE for settlements');
  }

  // Fetch order with current settlements
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { settlements: true },
  });

  if (!order) {
    throw new Error('Order not found');
  }

  // Cannot settle cancelled orders
  if (order.status === 'CANCELLED') {
    throw new Error('Cannot settle a cancelled order');
  }

  // Calculate total settled amount
  const totalSettled = order.settlements.reduce((sum, s) => sum + s.amountMinor, 0);
  const newTotal = totalSettled + amountMinor;

  // Cannot over-settle
  if (newTotal > order.totalAmount) {
    throw new Error(
      `Settlement amount ${amountMinor} would exceed order total. ` +
      `Order: ${order.totalAmount}, Already settled: ${totalSettled}, Remaining: ${order.totalAmount - totalSettled}`
    );
  }

  // Determine new settlement status
  let newSettlementStatus: SettlementStatus;
  if (newTotal === order.totalAmount) {
    newSettlementStatus = 'SETTLED';
  } else if (newTotal > 0) {
    newSettlementStatus = 'PARTIALLY_SETTLED';
  } else {
    newSettlementStatus = 'UNSETTLED';
  }

  // Atomic transaction: create settlement + update order
  // Uses transaction wrapper for replica set compatibility
  const result = await executeInTransaction(prisma, async (tx) => {
    // Create settlement record
    const settlement = await tx.settlement.create({
      data: {
        orderId,
        amountMinor,
        method,
        reference,
        note,
        recordedById,
        idempotencyKey,
      },
    });

    // Update order settlement status atomically
    // Use updateMany with where clause to ensure order wasn't modified concurrently
    const updateResult = await tx.order.updateMany({
      where: {
        id: orderId,
        settlementStatus: order.settlementStatus, // Optimistic lock
      },
      data: {
        settlementStatus: newSettlementStatus,
        // Update deprecated fields for backward compatibility
        isPaid: newSettlementStatus === 'SETTLED',
        paymentMethod: newSettlementStatus === 'SETTLED' ? method : order.paymentMethod,
        paidAt: newSettlementStatus === 'SETTLED' ? new Date() : order.paidAt,
      },
    });

    // If updateMany affected 0 rows, order was concurrently modified
    // This check provides optimistic locking in both replica set and standalone modes
    checkOptimisticLock(updateResult.count, 'Order');

    // Fetch updated order
    const updatedOrder = await tx.order.findUnique({
      where: { id: orderId },
      include: { settlements: true },
    });

    return { settlement, order: updatedOrder };
  });

  // Audit log
  await recordAudit({
    actorId: recordedById,
    actionType: 'ORDER_SETTLED',
    targetType: 'Order',
    targetId: orderId,
    details: {
      settlementId: result.settlement.id,
      amountMinor,
      method,
      reference,
      newSettlementStatus,
      totalSettled: newTotal,
      orderTotal: order.totalAmount,
    },
  });

  return result;
}

/**
 * Get all settlements for an order
 */
export async function getOrderSettlements(orderId: string) {
  return prisma.settlement.findMany({
    where: { orderId },
    include: {
      recordedBy: {
        select: { id: true, name: true, role: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Get settlement by ID
 */
export async function getSettlementById(settlementId: string) {
  return prisma.settlement.findUnique({
    where: { id: settlementId },
    include: {
      order: true,
      recordedBy: {
        select: { id: true, name: true, role: true },
      },
    },
  });
}

/**
 * Calculate remaining amount to settle for an order
 */
export async function getRemainingAmount(orderId: string): Promise<number> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { settlements: true },
  });

  if (!order) {
    throw new Error('Order not found');
  }

  const totalSettled = order.settlements.reduce((sum, s) => sum + s.amountMinor, 0);
  return Math.max(0, order.totalAmount - totalSettled);
}
