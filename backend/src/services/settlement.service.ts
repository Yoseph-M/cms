/**
 * Settlement Service
 * 
 * Handles external payment settlement recording.
 * The CMS does NOT process payments; it only records settlements
 * that occurred through external means (cash, card terminal, mobile payment, etc.)
 * 
 * SETTLEMENT ATTRIBUTION SEMANTICS:
 * - Every method (CASH, CARD, MOBILE) is recorded the same way: the settlement
 *   actor is stored in `recordedById`. Shift management has been removed, so
 *   there is no open-shift requirement and no cash drawer ledger entry.
 *
 * All operations are atomic and idempotent.
 */

import { prisma } from './prisma.service';
import { recordAudit } from './audit.service';
import { PaymentMethod, SettlementStatus, OrderStatus } from '@prisma/client';
import { executeInCriticalTransaction } from '../utils/transaction';
import { canSettle } from '../utils/orderStateMachine';
import {
  ValidationError,
  NotFoundError,
  OrderAlreadyCancelledError,
  SettlementOverageError,
  AlreadySettledError,
  IdempotencyConflictError,
  ConcurrentModificationError,
} from '../utils/errors';

interface CreateSettlementParams {
  orderId: string;
  amountMinor: number;
  method: PaymentMethod;
  reference?: string;
  note?: string;
  recordedById: string;
  idempotencyKey?: string;
  requestFingerprint?: string; // For idempotency verification
}

interface SettlementResult {
  /** True when the idempotency key matched an existing settlement (a retry). */
  isReplay?: boolean;
  settlement: {
    id: string;
    orderId: string;
    amountMinor: number;
    method: PaymentMethod;
    reference: string;
    note: string;
    recordedById: string;
    idempotencyKey: string | null;
    createdAt: Date;
  };
  order: {
    id: string;
    clientOrderId: string;
    totalAmount: number;
    settlementStatus: SettlementStatus;
    status: OrderStatus;
  };
}

async function findIdempotentSettlement(
  idempotencyKey: string,
  requestFingerprint?: string,
): Promise<SettlementResult | null> {
  const existing = await prisma.settlement.findUnique({
    where: { idempotencyKey },
    include: { order: true },
  });

  if (!existing) return null;

  if (requestFingerprint) {
    const existingFingerprint = `${existing.orderId}:${existing.amountMinor}:${existing.method}`;
    if (existingFingerprint !== requestFingerprint) {
      throw new IdempotencyConflictError(
        'Idempotency key reused with different request parameters',
      );
    }
  }

  return { isReplay: true, settlement: existing, order: existing.order };
}

function isIdempotencyKeyConflict(error: any): boolean {
  if (error?.code !== 'P2002') return false;
  const target = error.meta?.target;
  return Array.isArray(target)
    ? target.includes('idempotencyKey')
    : typeof target === 'string' && target.includes('idempotencyKey');
}

/**
 * MongoDB aborts contending transactions with these transient codes; retrying
 * at the app level isn't meaningful for settlements (the winner has already
 * committed), so the loser maps to a clean 409 instead of a 500.
 */
function isTransientTransactionError(error: any): boolean {
  const message = String(error?.message ?? '');
  return (
    error?.code === 112 || // WriteConflict
    error?.code === 251 || // NoSuchTransaction
    error?.errorLabels?.includes('TransientTransactionError') ||
    /write conflict|deadlock|NoSuchTransaction/i.test(message)
  );
}

/**
 * Record an external settlement for an order
 * Implements atomic concurrency control and idempotency
 * All financial calculations happen inside the transaction
 */
export async function recordSettlement(params: CreateSettlementParams): Promise<SettlementResult> {
  const { orderId, amountMinor, method, reference = '', note = '', recordedById, idempotencyKey, requestFingerprint } = params;

  // Validate amount (Invariant 1: amount > 0)
  if (amountMinor <= 0) {
    throw new ValidationError('Settlement amount must be greater than zero', 'amountMinor');
  }

  // Validate payment method
  if (method === 'NONE') {
    throw new ValidationError('Payment method cannot be NONE for settlements', 'method');
  }

  // Pre-check: If idempotency key exists, check outside transaction for fast return
  if (idempotencyKey) {
    const existing = await findIdempotentSettlement(idempotencyKey, requestFingerprint);
    if (existing) return existing;
  }

  // Pre-check: Quick validation of order status outside transaction to fail fast
  const preCheckOrder = await prisma.order.findUnique({
    where: { id: orderId },
    select: { status: true, settlementStatus: true },
  });

  if (!preCheckOrder) {
    throw new NotFoundError('Order', orderId);
  }

  if (!canSettle(preCheckOrder.status)) {
    throw new OrderAlreadyCancelledError(orderId);
  }

  if (preCheckOrder.settlementStatus === SettlementStatus.SETTLED) {
    throw new AlreadySettledError(orderId);
  }

  // Use critical transaction wrapper - will fail if transactions unavailable
  let result: SettlementResult;
  try {
    result = await executeInCriticalTransaction(prisma, async (tx) => {
    // 2. Load order WITHIN the transaction for authoritative state
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { settlements: true },
    });

    if (!order) {
      throw new NotFoundError('Order', orderId);
    }

    // Invariant 4: Cannot settle cancelled orders
    if (!canSettle(order.status)) {
      throw new OrderAlreadyCancelledError(orderId);
    }

    // Invariant 5: Once fully settled, additional settlement is rejected
    if (order.settlementStatus === SettlementStatus.SETTLED) {
      throw new AlreadySettledError(orderId);
    }

    // 3. Calculate authoritative state INSIDE transaction
    const totalSettled = settledMoneyOn(order.settlements);
    const newTotal = totalSettled + amountMinor;

    // Invariant 2: sum(active settlements) <= order.totalAmount
    if (newTotal > order.totalAmount) {
      const remaining = order.totalAmount - totalSettled;
      throw new SettlementOverageError(remaining);
    }

    // Determine new settlement status (Invariant 3)
    let newSettlementStatus: SettlementStatus;
    if (newTotal === order.totalAmount) {
      newSettlementStatus = 'SETTLED';
    } else if (newTotal > 0) {
      newSettlementStatus = 'PARTIALLY_SETTLED';
    } else {
      newSettlementStatus = 'UNSETTLED';
    }

    // 4. Create settlement record WITHIN transaction. A same-key collision is
    // handled outside this transaction, after the winning transaction commits.
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

    // 5. Update order settlement status atomically using optimistic locking
    // This ensures we don't overwrite if status changed since we read
    
    const updateData: {
      settlementStatus: SettlementStatus;
      status?: OrderStatus;
      isPaid?: boolean;
      paidAt?: Date;
      cashierId?: string;
      paymentMethod?: PaymentMethod;
    } = {
      settlementStatus: newSettlementStatus,
    };
    
    if (newSettlementStatus === 'SETTLED') {
      updateData.status = OrderStatus.PAID;
      updateData.isPaid = true;
      updateData.paidAt = new Date();
      updateData.cashierId = recordedById;
      updateData.paymentMethod = method;
    }

    const updateResult = await tx.order.updateMany({
      where: {
        id: orderId,
        // Optimistic lock: only update if status hasn't changed
        settlementStatus: order.settlementStatus,
      },
      data: updateData,
    });

    if (updateResult.count === 0) {
      // Concurrent modification - another request already updated
      throw new ConcurrentModificationError('Order');
    }

    // Fetch updated order
    const updatedOrder = await tx.order.findUnique({
      where: { id: orderId },
    });

      return { settlement, order: updatedOrder! };
    });
  } catch (error: any) {
    // MongoDB replica sets abort contending transactions with a transient
    // write conflict/deadlock. From the caller's perspective that IS a
    // concurrent modification — another request settled the order first — so
    // surface it as a 409 instead of leaking a 500.
    if (isTransientTransactionError(error)) {
      throw new ConcurrentModificationError('Order');
    }
    // Two identical browser requests can both pass the initial lookup. The
    // unique index chooses one winner; return that winner rather than exposing
    // a 409 that encourages the cashier to submit payment again.
    if (idempotencyKey && isIdempotencyKeyConflict(error)) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const existing = await findIdempotentSettlement(idempotencyKey, requestFingerprint);
        if (existing) return existing;
        await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
      }
    }
    throw error;
  }

  // Audit log (outside transaction - but this is acceptable as it's for observability)
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
      newSettlementStatus: result.order.settlementStatus,
      totalSettled: amountMinor, // Approximation - in real scenario would recalculate
      orderTotal: result.order.totalAmount,
    },
  });

  return result;
}

/**
 * Get all settlements for an order
 */
/**
 * The money an order has actually taken.
 *
 * A VOID row (method NONE) is an audit entry, not a payment: the cancellation
 * paths write one carrying the ticket's whole value so the void is visible on
 * the settlements pages. Adding those rows to a money total made a cancelled
 * ticket look settled in full — and, once a part payment was on the ticket, it
 * pushed "settled" above the order total. Only collection rows count here.
 */
export function settledMoneyOn(settlements: Array<{ amountMinor: number; method: string }>): number {
  return settlements
    .filter((s) => s.method !== 'NONE')
    .reduce((sum, s) => sum + s.amountMinor, 0);
}

export async function getOrderSettlements(orderId: string) {
  return prisma.settlement.findMany({
    where: { orderId },
    include: {
      recordedBy: {
        select: { id: true, name: true, role: true },
      },
      order: {
        select: {
          waiter: { select: { id: true, name: true, role: true } }
        }
      }
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
      order: {
        include: {
          waiter: { select: { id: true, name: true, role: true } }
        }
      },
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
    throw new NotFoundError('Order', orderId);
  }

  // A cancelled ticket has nothing left to collect: its VOID audit row is not
  // money, and nobody owes the remainder of a voided order.
  if (order.status === OrderStatus.CANCELLED) return 0;

  const totalSettled = settledMoneyOn(order.settlements);
  return Math.max(0, order.totalAmount - totalSettled);
}
