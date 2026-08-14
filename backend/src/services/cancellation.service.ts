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
import { CancellationRequestStatus, OrderStatus, SettlementStatus } from '@prisma/client';
import { executeInCriticalTransaction } from '../utils/transaction';
import {
  NotFoundError,
  ValidationError,
  OrderAlreadyCancelledError,
  CannotCancelSettledOrderError,
  CancellationRequestNotPendingError,
  ConcurrentModificationError,
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
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { 
      settlements: true,
    },
  });

  if (!order) {
    throw new NotFoundError('Order', orderId);
  }

  // Cannot request cancellation for already cancelled orders
  if (order.status === OrderStatus.CANCELLED) {
    throw new OrderAlreadyCancelledError(orderId);
  }

  // Cannot request cancellation for orders with any settlements
  if (order.settlementStatus !== SettlementStatus.UNSETTLED) {
    throw new CannotCancelSettledOrderError(orderId);
  }

  // Use critical transaction to prevent duplicate requests
  const request = await executeInCriticalTransaction(prisma, async (tx) => {
    // Check if there's already a pending cancellation request
    const pendingRequest = await tx.orderCancellationRequest.findFirst({
      where: { 
        orderId,
        status: PENDING_STATUS,
      },
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
    return tx.orderCancellationRequest.create({
      data: {
        orderId,
        requestedById,
        reason: reason.trim(),
        status: PENDING_STATUS,
      },
      include: {
        order: true,
        requestedBy: {
          select: { id: true, name: true, role: true },
        },
      },
    });
  });

  // Audit log
  await recordAudit({
    actorId: requestedById,
    actionType: 'CANCELLATION_REQUESTED',
    targetType: 'Order',
    targetId: orderId,
    details: {
      requestId: request.id,
      reason: reason.trim(),
    },
  });

  // Emit socket notification to managers/owners
  emitToLiveOrders('cancellation:requested', {
    request: {
      id: request.id,
      orderId: request.orderId,
      requestedBy: request.requestedBy,
      reason: request.reason,
      status: request.status,
      createdAt: request.createdAt,
    },
    order: {
      id: request.order.id,
      clientOrderId: request.order.clientOrderId,
      tableNumber: request.order.tableNumber,
      totalAmount: request.order.totalAmount,
    },
  });

  return request;
}

/**
 * Approve a cancellation request and cancel the order
 * Uses conditional update to prevent race conditions
 */
export async function approveCancellation(params: ApproveCancellationParams) {
  const { requestId, approvedById } = params;

  // Use critical transaction - approval must be atomic
  const result = await executeInCriticalTransaction(prisma, async (tx) => {
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
      throw new CancellationRequestNotPendingError(requestId, 'already processed');
    }

    // 2. Fetch the updated request (now approved)
    const approvedRequest = await tx.orderCancellationRequest.findUnique({
      where: { id: requestId },
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

    // 3. Validate order is still eligible for cancellation
    if (approvedRequest!.order.status === OrderStatus.CANCELLED) {
      throw new OrderAlreadyCancelledError(approvedRequest!.orderId);
    }

    if (approvedRequest!.order.settlementStatus !== SettlementStatus.UNSETTLED) {
      throw new CannotCancelSettledOrderError(approvedRequest!.orderId);
    }

    // 4. Cancel the order - also use conditional update
    const orderUpdateResult = await tx.order.updateMany({
      where: {
        id: approvedRequest!.orderId,
        status: { not: OrderStatus.CANCELLED }, // Only if not already cancelled
      },
      data: {
        status: OrderStatus.CANCELLED,
        cancellationReason: approvedRequest!.reason,
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

    // 5. Fetch final state
    const cancelledOrder = await tx.order.findUnique({
      where: { id: approvedRequest!.orderId },
    });

    return { request: approvedRequest!, order: cancelledOrder };
  });

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

  // Use critical transaction for atomic rejection
  const result = await executeInCriticalTransaction(prisma, async (tx) => {
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
      throw new CancellationRequestNotPendingError(requestId, 'already processed');
    }

    // 2. Fetch the updated request
    return tx.orderCancellationRequest.findUnique({
      where: { id: requestId },
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