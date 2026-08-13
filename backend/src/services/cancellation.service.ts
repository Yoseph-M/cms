/**
 * Cancellation Service
 * 
 * Handles order cancellation request workflow.
 * Provides formal request/approval flow instead of direct cancellation.
 */

import { prisma } from './prisma.service';
import { recordAudit } from './audit.service';
import { emitToLiveOrders } from './socket.service';
import { CancellationRequestStatus, OrderStatus } from '@prisma/client';
import { executeInTransaction, checkOptimisticLock } from '../utils/transaction';

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

/**
 * Create a cancellation request for an order
 */
export async function requestCancellation(params: CreateCancellationRequestParams) {
  const { orderId, requestedById, reason } = params;

  // Validate reason is provided
  if (!reason || reason.trim().length === 0) {
    throw new Error('Cancellation reason is required');
  }

  // Fetch order with settlements
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { 
      settlements: true,
      cancellationRequests: {
        where: { status: CancellationRequestStatus.PENDING },
      },
    },
  });

  if (!order) {
    throw new Error('Order not found');
  }

  // Cannot request cancellation for already cancelled orders
  if (order.status === OrderStatus.CANCELLED) {
    throw new Error('Order is already cancelled');
  }

  // Cannot request cancellation for orders with settlements (Phase 3 integration)
  if (order.settlementStatus !== 'UNSETTLED') {
    throw new Error('Cannot cancel orders that have been settled or partially settled');
  }

  // Check if there's already a pending cancellation request
  if (order.cancellationRequests.length > 0) {
    throw new Error('A pending cancellation request already exists for this order');
  }

  // Create cancellation request
  const request = await prisma.orderCancellationRequest.create({
    data: {
      orderId,
      requestedById,
      reason: reason.trim(),
      status: CancellationRequestStatus.PENDING,
    },
    include: {
      order: true,
      requestedBy: {
        select: { id: true, name: true, role: true },
      },
    },
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
 */
export async function approveCancellation(params: ApproveCancellationParams) {
  const { requestId, approvedById } = params;

  // Fetch cancellation request
  const request = await prisma.orderCancellationRequest.findUnique({
    where: { id: requestId },
    include: {
      order: {
        include: { settlements: true },
      },
      requestedBy: {
        select: { id: true, name: true, role: true },
      },
    },
  });

  if (!request) {
    throw new Error('Cancellation request not found');
  }

  // Validate request is still pending
  if (request.status !== CancellationRequestStatus.PENDING) {
    throw new Error(`Cancellation request is already ${request.status.toLowerCase()}`);
  }

  // Validate order hasn't been cancelled already
  if (request.order.status === OrderStatus.CANCELLED) {
    throw new Error('Order is already cancelled');
  }

  // Re-validate settlement status (in case it changed since request was created)
  if (request.order.settlementStatus !== 'UNSETTLED') {
    throw new Error('Cannot approve cancellation: order has been settled');
  }

  // Perform atomic transaction: approve request + cancel order
  // Uses transaction wrapper for replica set compatibility
  const result = await executeInTransaction(prisma, async (tx) => {
    // Update cancellation request to APPROVED
    const approvedRequest = await tx.orderCancellationRequest.update({
      where: { id: requestId },
      data: {
        status: CancellationRequestStatus.APPROVED,
        approvedById,
        approvedAt: new Date(),
      },
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

    // Cancel the order
    const cancelledOrder = await tx.order.update({
      where: { id: request.orderId },
      data: {
        status: OrderStatus.CANCELLED,
        cancellationReason: request.reason,
        cancelledById: approvedById,
      },
    });

    return { request: approvedRequest, order: cancelledOrder };
  });

  // Audit log
  await recordAudit({
    actorId: approvedById,
    actionType: 'CANCELLATION_APPROVED',
    targetType: 'Order',
    targetId: request.orderId,
    details: {
      requestId,
      requestedBy: request.requestedBy.name,
      reason: request.reason,
    },
  });

  // Emit socket notifications
  // 1. Notify about the cancellation approval
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

  // 2. Notify about the order cancellation
  emitToLiveOrders('order:cancelled', result.order);

  return result;
}

/**
 * Reject a cancellation request
 */
export async function rejectCancellation(params: RejectCancellationParams) {
  const { requestId, approvedById, rejectedReason } = params;

  // Validate rejection reason is provided
  if (!rejectedReason || rejectedReason.trim().length === 0) {
    throw new Error('Rejection reason is required');
  }

  // Fetch cancellation request
  const request = await prisma.orderCancellationRequest.findUnique({
    where: { id: requestId },
    include: {
      order: true,
      requestedBy: {
        select: { id: true, name: true, role: true },
      },
    },
  });

  if (!request) {
    throw new Error('Cancellation request not found');
  }

  // Validate request is still pending
  if (request.status !== CancellationRequestStatus.PENDING) {
    throw new Error(`Cancellation request is already ${request.status.toLowerCase()}`);
  }

  // Update request to REJECTED
  const rejectedRequest = await prisma.orderCancellationRequest.update({
    where: { id: requestId },
    data: {
      status: CancellationRequestStatus.REJECTED,
      approvedById, // approvedBy is actually "reviewedBy" in this context
      approvedAt: new Date(),
      rejectedReason: rejectedReason.trim(),
    },
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

  // Audit log
  await recordAudit({
    actorId: approvedById,
    actionType: 'CANCELLATION_REJECTED',
    targetType: 'Order',
    targetId: request.orderId,
    details: {
      requestId,
      requestedBy: request.requestedBy.name,
      originalReason: request.reason,
      rejectedReason: rejectedReason.trim(),
    },
  });

  // Emit socket notification about rejection
  emitToLiveOrders('cancellation:rejected', {
    request: {
      id: rejectedRequest.id,
      orderId: rejectedRequest.orderId,
      requestedBy: rejectedRequest.requestedBy,
      approvedBy: rejectedRequest.approvedBy,
      reason: rejectedRequest.reason,
      rejectedReason: rejectedRequest.rejectedReason,
      status: rejectedRequest.status,
      approvedAt: rejectedRequest.approvedAt,
    },
  });

  return rejectedRequest;
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

  const where: any = {};
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
  return prisma.orderCancellationRequest.findUnique({
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
}
