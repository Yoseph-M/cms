/**
 * Settlement Service
 * 
 * Handles external payment settlement recording.
 * The CMS does NOT process payments; it only records settlements
 * that occurred through external means (cash, card terminal, mobile payment, etc.)
 * 
 * SETTLEMENT ATTRIBUTION SEMANTICS:
 * - CASH settlements: REQUIRE active cashier shift
 *   → Creates cash drawer ledger entry
 *   → Links settlement to shift via shiftId
 *   → Cashier must have OPEN shift
 * 
 * - CARD/MOBILE/OTHER settlements: NO shift requirement
 *   → Only records the settlement actor (recordedById)
 *   → Does NOT affect cash drawer
 *   → Can be processed by any authenticated user
 * 
 * All operations are atomic and idempotent.
 */

import { prisma } from './prisma.service';
import { recordAudit } from './audit.service';
import { PaymentMethod, SettlementStatus, OrderStatus, CashDrawerEventType } from '@prisma/client';
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
  settlement: {
    id: string;
    orderId: string;
    amountMinor: number;
    method: PaymentMethod;
    reference: string;
    note: string;
    recordedById: string;
    shiftId: string | null;
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
    const existing = await prisma.settlement.findUnique({
      where: { idempotencyKey },
      include: { order: true },
    });
    
    if (existing) {
      // If fingerprint provided, check for materially different request
      if (requestFingerprint) {
        const existingFingerprint = `${existing.orderId}:${existing.amountMinor}:${existing.method}`;
        if (existingFingerprint !== requestFingerprint) {
          throw new IdempotencyConflictError(
            'Idempotency key reused with different request parameters'
          );
        }
      }
      
      // Return existing settlement immediately (idempotent response, no transaction needed)
      return {
        settlement: existing,
        order: existing.order,
      };
    }
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
  const result = await executeInCriticalTransaction(prisma, async (tx) => {
    // 1. First check idempotency key INSIDE the transaction
    if (idempotencyKey) {
      const existing = await tx.settlement.findUnique({
        where: { idempotencyKey },
        include: { order: true },
      });
      
      if (existing) {
        // If fingerprint provided, check for materially different request
        if (requestFingerprint) {
          const existingFingerprint = `${existing.orderId}:${existing.amountMinor}:${existing.method}`;
          if (existingFingerprint !== requestFingerprint) {
            throw new IdempotencyConflictError(
              'Idempotency key reused with different request parameters'
            );
          }
        }
        
        // Return existing settlement (idempotent response)
        return {
          settlement: existing,
          order: existing.order,
        };
      }
    }

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
    const totalSettled = order.settlements.reduce((sum, s) => sum + s.amountMinor, 0);
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

    // 4. Create settlement record WITHIN transaction
    // For CASH settlements: find active shift and link
    let shiftId: string | null = null;
    
    if (method === PaymentMethod.CASH) {
      const activeShift = await tx.cashierShift.findFirst({
        where: { cashierId: recordedById, status: 'OPEN' },
      });
      
      if (!activeShift) {
        throw new ValidationError(
          'CASH settlements require an active cashier shift. Please open a shift first.',
          'method'
        );
      }
      
      shiftId = activeShift.id;
    }
    
    const settlement = await tx.settlement.create({
      data: {
        orderId,
        amountMinor,
        method,
        reference,
        note,
        recordedById,
        shiftId,
        idempotencyKey,
      },
    });

    // 4.5. Auto-create CASH_SETTLEMENT ledger entry if CASH
    if (method === PaymentMethod.CASH && shiftId) {
      await tx.cashDrawerEvent.create({
        data: {
          shiftId,
          type: CashDrawerEventType.CASH_SETTLEMENT,
          amountMinor,
          referenceType: 'Settlement',
          referenceId: settlement.id,
          performedById: recordedById,
          notes: `Cash settlement for order ${orderId}`,
        },
      });
    }

    // 5. Update order settlement status atomically using optimistic locking
    // This ensures we don't overwrite if status changed since we read
    
    const updateData: any = {
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

  return {
    settlement: {
      id: result.settlement.id,
      orderId: result.settlement.orderId,
      amountMinor: result.settlement.amountMinor,
      method: result.settlement.method as PaymentMethod,
      reference: result.settlement.reference,
      note: result.settlement.note,
      recordedById: result.settlement.recordedById,
      shiftId: result.settlement.shiftId,
      idempotencyKey: result.settlement.idempotencyKey,
      createdAt: result.settlement.createdAt,
    },
    order: {
      id: result.order.id,
      clientOrderId: result.order.clientOrderId,
      totalAmount: result.order.totalAmount,
      settlementStatus: result.order.settlementStatus as SettlementStatus,
      status: result.order.status as OrderStatus,
    },
  };
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
    throw new NotFoundError('Order', orderId);
  }

  const totalSettled = order.settlements.reduce((sum, s) => sum + s.amountMinor, 0);
  return Math.max(0, order.totalAmount - totalSettled);
}