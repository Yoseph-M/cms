/**
 * Cancellation Service
 * 
 * Handles order cancellation request workflow.
 * Provides formal request/approval flow instead of direct cancellation.
 * 
 * All operations are atomic - approval/rejection uses conditional updates
 * to prevent race conditions when multiple reviewers act simultaneously.
 */

import { prisma } from './prisma.service';
import { recordAudit } from './audit.service';
import { emitToLiveOrders } from './socket.service';
import { CancellationRequestStatus, OrderStatus, PaymentMethod, SettlementStatus } from '@prisma/client';
import { logger } from '../utils/logger';
import { executeInCriticalTransaction } from '../utils/transaction';
import {
  ConcurrentModificationError,
  NotFoundError,
  ValidationError,
  OrderAlreadyCancelledError,
  CannotCancelSettledOrderError,
  CancellationRequestNotPendingError,
} from '../utils/errors';

interface CreateCancellationRequestParams {
  orderId: string;
  requestedById: string;
  reason: string;
}

interface ApproveCancellationParams {
  requestId: string;
  approvedById: string;
}

interface RejectCancellationParams {
  requestId: string;
  approvedById: string;
  rejectedReason: string;
}

const PENDING_STATUS = CancellationRequestStatus.PENDING;
const APPROVED_STATUS = CancellationRequestStatus.APPROVED;
const REJECTED_STATUS = CancellationRequestStatus.REJECTED;

/**
 * Create a cancellation request for an order
 */
export async function requestCancellation(params: CreateCancellationRequestParams) {
  const { orderId, requestedById, reason } = params;

  // Validate reason is provided
  if (!reason || reason.trim().length === 0) {
    throw new ValidationError('Cancellation reason is required', 'reason');
  }

  // Check order exists and is eligible for cancellation
  const [order, requester] = await Promise.all([
    prisma.order.findUnique({
      where: { id: orderId },
      include: { 
        settlements: true,
      },
    }),
    prisma.user.findUnique({
      where: { id: requestedById },
      select: { role: true },
    }),
  ]);

  if (!order) {
    throw new NotFoundError('Order', orderId);
  }

  if (!requester) {
    throw new NotFoundError('User', requestedById);
  }

  // Cannot request cancellation for already cancelled orders
  if (order.status === OrderStatus.CANCELLED) {
    throw new OrderAlreadyCancelledError(orderId);
  }

  // Cannot request cancellation for orders with any settlements
  if (order.settlementStatus !== SettlementStatus.UNSETTLED) {
    throw new CannotCancelSettledOrderError(orderId);
  }

  // Auto-approve if requester is a WAITER
  const isWaiter = requester.role === 'WAITER';

  // Use critical transaction to prevent duplicate requests
  const result = await executeInCriticalTransaction(prisma, async (tx) => {
    // Check if there's already a pending cancellation request
    const pendingRequest = await tx.orderCancellationRequest.findFirst({
      where: { 
        orderId,
        status: PENDING_STATUS,
      },
      select: { id: true }, // Only need to know if it exists
    });

    if (pendingRequest) {
      throw new ValidationError('A pending cancellation request already exists for this order');
    }

    // Re-verify order still eligible (inside transaction)
    const currentOrder = await tx.order.findUnique({
      where: { id: orderId },
      select: { status: true, settlementStatus: true },
    });

    if (currentOrder?.status === OrderStatus.CANCELLED) {
      throw new OrderAlreadyCancelledError(orderId);
    }

    if (currentOrder?.settlementStatus !== SettlementStatus.UNSETTLED) {
      throw new CannotCancelSettledOrderError(orderId);
    }

    // Create cancellation request
    const request = await tx.orderCancellationRequest.create({
      data: {
        orderId,
        requestedById,
        reason: reason.trim(),
        status: isWaiter ? APPROVED_STATUS : PENDING_STATUS,
        approvedById: isWaiter ? requestedById : null,
        approvedAt: isWaiter ? new Date() : null,
      },
      include: {
        order: true,
        requestedBy: {
          select: { id: true, name: true, role: true },
        },
      },
    });

    // If auto-approved, also cancel the order
    if (isWaiter) {
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.CANCELLED,
          cancellationReason: reason.trim(),
          cancelledById: requestedById,
        },
      });
    }

    return request;
  });

  // A cancelled order must be visible on the Settlements page, so write the
  // same VOID settlement the direct-cancel path writes. Non-critical: the
  // cancellation itself has already succeeded either way.
  if (isWaiter) {
    try {
      const alreadyLogged = await prisma.settlement.findFirst({
        where: { orderId, reference: 'VOID' },
        select: { id: true },
      });
      if (!alreadyLogged) {
        await prisma.settlement.create({
          data: {
            orderId,
            amountMinor: Math.max(result.order.totalAmount, 0),
            method: PaymentMethod.NONE,
            reference: 'VOID',
            note: `Cancelled: ${reason.trim()}`,
            recordedById: requestedById,
          },
        });
      }
    } catch (settlementErr) {
      logger.warn({ err: settlementErr, orderId }, 'Failed to record void settlement for auto-approved cancellation');
    }
  }

  // Audit log
  await recordAudit({
    actorId: requestedById,
    actionType: isWaiter ? 'ORDER_CANCELLED' : 'CANCELLATION_REQUESTED',
    targetType: 'Order',
    targetId: orderId,
    details: {
      requestId: result.id,
      reason: reason.trim(),
      autoApproved: isWaiter,
    },
  });

  // Emit socket notification
  if (isWaiter) {
    emitToLiveOrders('order:cancelled', result.order as any);
  } else {
    emitToLiveOrders('cancellation:requested', {
      request: {
        id: result.id,
        orderId: result.orderId,
        requestedBy: result.requestedBy,
        reason: result.reason,
        status: result.status,
        createdAt: result.createdAt,
      },
      order: {
        id: result.order.id,
        clientOrderId: result.order.clientOrderId,
        tableNumber: result.order.tableNumber,
        totalAmount: result.order.totalAmount,
      },
    });
  }

  return result;
}

/**
 * MongoDB aborts contending transactions with a transient write conflict.
 * Review operations race constantly (two managers clicking at once), so retry
 * the whole critical transaction a few times before giving up.
 */
async function withTransactionRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const message = String((err as Error)?.message ?? '');
      const transient =
        (err as { code?: number })?.code === 112 ||
        (err as { errorLabels?: string[] })?.errorLabels?.includes('TransientTransactionError') ||
        /write conflict|deadlock|NoSuchTransaction/i.test(message);
      if (!transient) throw err;
      await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
    }
  }
  // Retries exhausted — MongoDB never gave us a clean read. From the caller's
  // perspective another reviewer's write won, which is a conflict, not a 500.
  throw new ConcurrentModificationError('CancellationRequest');
}

/**
 * Approve a cancellation request and cancel the order
 * Uses conditional update to prevent race conditions.
 * Idempotent: approving an already-approved request returns 200.
 */
export async function approveCancellation(params: ApproveCancellationParams) {
  const { requestId, approvedById } = params;

  // Use critical transaction - approval must be atomic
  const { requestId: approvedRequestId, orderId } = await withTransactionRetry(() =>
    executeInCriticalTransaction(prisma, async (tx) => {
      // 1. Try to update cancellation request with conditional WHERE clause
      // This ensures we only succeed if status is still PENDING
      const updateResult = await tx.orderCancellationRequest.updateMany({
        where: {
          id: requestId,
          status: PENDING_STATUS, // Only update if still pending!
        },
        data: {
          status: APPROVED_STATUS,
          approvedById,
          approvedAt: new Date(),
        },
      });

      // If zero rows affected, another reviewer already acted
      if (updateResult.count === 0) {
        const existing = await tx.orderCancellationRequest.findUnique({
          where: { id: requestId },
          select: { id: true, orderId: true, status: true },
        });
        if (!existing) {
          throw new NotFoundError('CancellationRequest', requestId);
        }
        // Approving an already-approved request is an idempotent no-op.
        if (existing.status === APPROVED_STATUS) {
          return { requestId: existing.id, orderId: existing.orderId, idempotent: true as const };
        }
        // Approving a rejected request is a real conflict.
        throw new CancellationRequestNotPendingError(requestId, `already ${existing.status.toLowerCase()}`);
      }

      // 2. Fetch minimal data to validate eligibility
      const approvedRequest = await tx.orderCancellationRequest.findUnique({
        where: { id: requestId },
        select: { 
          id: true, 
          orderId: true, 
          reason: true,
          order: {
            select: {
              status: true,
              settlementStatus: true,
            },
          },
        },
      });

      if (!approvedRequest) {
        throw new NotFoundError('CancellationRequest', requestId);
      }

      // 3. Validate order is still eligible for cancellation
      if (approvedRequest.order.status === OrderStatus.CANCELLED) {
        throw new OrderAlreadyCancelledError(approvedRequest.orderId);
      }

      if (approvedRequest.order.settlementStatus !== SettlementStatus.UNSETTLED) {
        throw new CannotCancelSettledOrderError(approvedRequest.orderId);
      }

      // 4. Cancel the order - also use conditional update
      const orderUpdateResult = await tx.order.updateMany({
        where: {
          id: approvedRequest.orderId,
          status: { not: OrderStatus.CANCELLED }, // Only if not already cancelled
        },
        data: {
          status: OrderStatus.CANCELLED,
          cancellationReason: approvedRequest.reason,
          cancelledById: approvedById,
        },
      });

      // If order couldn't be cancelled (concurrent modification), 
      // the request is already approved but order update failed
      // This is an inconsistent state we need to handle
      if (orderUpdateResult.count === 0) {
        // Order was already cancelled or status changed - log but continue
        // The request is approved so we return that, but order was already cancelled
      }

      return { 
        requestId: approvedRequest.id, 
        orderId: approvedRequest.orderId,
        idempotent: false as const,
      };
    }),
  );

  // Fetch full details OUTSIDE transaction
  const [approvedRequest, cancelledOrder] = await Promise.all([
    prisma.orderCancellationRequest.findUnique({
      where: { id: approvedRequestId },
      include: {
        order: true,
        requestedBy: {
          select: { id: true, name: true, role: true },
        },
        approvedBy: {
          select: { id: true, name: true, role: true },
        },
      },
    }),
    prisma.order.findUnique({
      where: { id: orderId },
    }),
  ]);

  if (!approvedRequest) {
    throw new NotFoundError('CancellationRequest', requestId);
  }

  const result = { request: approvedRequest, order: cancelledOrder };

  // A cancelled order must be visible on the Settlements page, so write the
  // same VOID settlement the direct-cancel path writes. Non-critical: the
  // approval itself has already succeeded either way.
  if (cancelledOrder) {
    try {
      const alreadyLogged = await prisma.settlement.findFirst({
        where: { orderId, reference: 'VOID' },
        select: { id: true },
      });
      if (!alreadyLogged) {
        await prisma.settlement.create({
          data: {
            orderId,
            amountMinor: Math.max(cancelledOrder.totalAmount, 0),
            method: PaymentMethod.NONE,
            reference: 'VOID',
            note: `Cancelled: ${approvedRequest.reason}`,
            recordedById: approvedById,
          },
        });
      }
    } catch (settlementErr) {
      logger.warn({ err: settlementErr, orderId }, 'Failed to record void settlement for approved cancellation');
    }
  }

  // Audit log
  await recordAudit({
    actorId: approvedById,
    actionType: 'CANCELLATION_APPROVED',
    targetType: 'Order',
    targetId: result.request.orderId,
    details: {
      requestId,
      requestedBy: result.request.requestedBy.name,
      reason: result.request.reason,
    },
  });

  // Emit socket notifications
  emitToLiveOrders('cancellation:approved', {
    request: {
      id: result.request.id,
      orderId: result.request.orderId,
      requestedBy: result.request.requestedBy,
      approvedBy: result.request.approvedBy,
      reason: result.request.reason,
      status: result.request.status,
      approvedAt: result.request.approvedAt,
    },
  });

  emitToLiveOrders('order:cancelled', result.order as any);

  return result;
}

/**
 * Reject a cancellation request
 * Uses conditional update to prevent race conditions
 */
export async function rejectCancellation(params: RejectCancellationParams) {
  const { requestId, approvedById, rejectedReason } = params;

  // Validate rejection reason is provided
  if (!rejectedReason || rejectedReason.trim().length === 0) {
    throw new ValidationError('Rejection reason is required', 'rejectedReason');
  }

  // Use critical transaction for atomic rejection.
  // Idempotent: rejecting an already-rejected request returns 200.
  const rejectedRequestId = await withTransactionRetry(() =>
    executeInCriticalTransaction(prisma, async (tx) => {
      // 1. Try to update with conditional WHERE clause
      const updateResult = await tx.orderCancellationRequest.updateMany({
        where: {
          id: requestId,
          status: PENDING_STATUS, // Only update if still pending!
        },
        data: {
          status: REJECTED_STATUS,
          approvedById, // approvedBy is actually "reviewedBy" in this context
          approvedAt: new Date(),
          rejectedReason: rejectedReason.trim(),
        },
      });

      // If zero rows affected, another reviewer already acted
      if (updateResult.count === 0) {
        const existing = await tx.orderCancellationRequest.findUnique({
          where: { id: requestId },
          select: { id: true, status: true },
        });
        if (!existing) {
          throw new NotFoundError('CancellationRequest', requestId);
        }
        // Rejecting an already-rejected request is an idempotent no-op.
        if (existing.status === REJECTED_STATUS) {
          return existing.id;
        }
        // Rejecting an approved request is a real conflict.
        throw new CancellationRequestNotPendingError(requestId, `already ${existing.status.toLowerCase()}`);
      }

      return requestId;
    }),
  );

  // 2. Fetch the updated request OUTSIDE transaction
  const result = await prisma.orderCancellationRequest.findUnique({
    where: { id: rejectedRequestId },
    include: {
      order: true,
      requestedBy: {
        select: { id: true, name: true, role: true },
      },
      approvedBy: {
        select: { id: true, name: true, role: true },
      },
    },
  });

  if (!result) {
    throw new NotFoundError('CancellationRequest', requestId);
  }

  // Audit log
  await recordAudit({
    actorId: approvedById,
    actionType: 'CANCELLATION_REJECTED',
    targetType: 'Order',
    targetId: result.orderId,
    details: {
      requestId,
      requestedBy: result.requestedBy.name,
      originalReason: result.reason,
      rejectedReason: rejectedReason.trim(),
    },
  });

  // Emit socket notification about rejection
  emitToLiveOrders('cancellation:rejected', {
    request: {
      id: result.id,
      orderId: result.orderId,
      requestedBy: result.requestedBy,
      approvedBy: result.approvedBy,
      reason: result.reason,
      rejectedReason: result.rejectedReason,
      status: result.status,
      approvedAt: result.approvedAt,
    },
  });

  return result;
}

/**
 * Get cancellation requests with optional filters
 */
export async function getCancellationRequests(filters?: {
  status?: CancellationRequestStatus;
  orderId?: string;
  requestedById?: string;
  limit?: number;
  skip?: number;
}) {
  const { status, orderId, requestedById, limit = 50, skip = 0 } = filters || {};

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (orderId) where.orderId = orderId;
  if (requestedById) where.requestedById = requestedById;

  const [requests, total] = await Promise.all([
    prisma.orderCancellationRequest.findMany({
      where,
      include: {
        order: {
          select: {
            id: true,
            clientOrderId: true,
            tableNumber: true,
            totalAmount: true,
            status: true,
            settlementStatus: true,
            createdAt: true,
          },
        },
        requestedBy: {
          select: { id: true, name: true, role: true },
        },
        approvedBy: {
          select: { id: true, name: true, role: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip,
    }),
    prisma.orderCancellationRequest.count({ where }),
  ]);

  return {
    data: requests,
    total,
    limit,
    skip,
  };
}

/**
 * Get a specific cancellation request by ID
 */
export async function getCancellationRequestById(requestId: string) {
  const request = await prisma.orderCancellationRequest.findUnique({
    where: { id: requestId },
    include: {
      order: {
        include: {
          waiter: {
            select: { id: true, name: true, role: true },
          },
          settlements: true,
        },
      },
      requestedBy: {
        select: { id: true, name: true, role: true },
      },
      approvedBy: {
        select: { id: true, name: true, role: true },
      },
    },
  });

  if (!request) {
    throw new NotFoundError(`Cancellation request not found: ${requestId}`);
  }

  return request;
}