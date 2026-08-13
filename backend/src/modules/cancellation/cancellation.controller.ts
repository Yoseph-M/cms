import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import {
  requestCancellation,
  approveCancellation,
  rejectCancellation,
  getCancellationRequests,
  getCancellationRequestById,
} from '../../services/cancellation.service';
import { logger } from '../../utils/logger';
import { CancellationRequestStatus } from '@prisma/client';

/**
 * POST /api/orders/:orderId/cancellation-request
 * Request cancellation for an order
 * RBAC: WAITER, CASHIER, MANAGER, OWNER
 */
export async function createCancellationRequest(req: AuthenticatedRequest, res: Response) {
  const { orderId } = req.params;
  const { reason } = req.body;
  const requestedById = req.user!.userId;

  try {
    const request = await requestCancellation({
      orderId,
      requestedById,
      reason,
    });

    return res.status(201).json(request);
  } catch (error: any) {
    logger.error({ error, orderId, requestedById }, 'Cancellation request creation failed');

    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }

    if (
      error.message.includes('already cancelled') ||
      error.message.includes('settled') ||
      error.message.includes('pending cancellation') ||
      error.message.includes('reason is required')
    ) {
      return res.status(400).json({ error: error.message });
    }

    return res.status(500).json({ error: 'Failed to create cancellation request' });
  }
}

/**
 * PATCH /api/cancellation-requests/:requestId/approve
 * Approve a cancellation request and cancel the order
 * RBAC: MANAGER, OWNER only
 */
export async function approveCancellationRequest(req: AuthenticatedRequest, res: Response) {
  const { requestId } = req.params;
  const approvedById = req.user!.userId;

  try {
    const result = await approveCancellation({
      requestId,
      approvedById,
    });

    return res.json(result);
  } catch (error: any) {
    logger.error({ error, requestId, approvedById }, 'Cancellation approval failed');

    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }

    if (
      error.message.includes('already') ||
      error.message.includes('settled') ||
      error.message.includes('cancelled')
    ) {
      return res.status(400).json({ error: error.message });
    }

    return res.status(500).json({ error: 'Failed to approve cancellation request' });
  }
}

/**
 * PATCH /api/cancellation-requests/:requestId/reject
 * Reject a cancellation request
 * RBAC: MANAGER, OWNER only
 */
export async function rejectCancellationRequest(req: AuthenticatedRequest, res: Response) {
  const { requestId } = req.params;
  const { rejectedReason } = req.body;
  const approvedById = req.user!.userId;

  try {
    const request = await rejectCancellation({
      requestId,
      approvedById,
      rejectedReason,
    });

    return res.json(request);
  } catch (error: any) {
    logger.error({ error, requestId, approvedById }, 'Cancellation rejection failed');

    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }

    if (error.message.includes('already') || error.message.includes('reason is required')) {
      return res.status(400).json({ error: error.message });
    }

    return res.status(500).json({ error: 'Failed to reject cancellation request' });
  }
}

/**
 * GET /api/cancellation-requests
 * List cancellation requests with optional filters
 * RBAC: All authenticated users
 */
export async function listCancellationRequests(req: AuthenticatedRequest, res: Response) {
  const { status, orderId, requestedById, limit, skip } = req.query;

  try {
    const filters: any = {};

    if (status) {
      // Validate status enum
      if (!['PENDING', 'APPROVED', 'REJECTED'].includes(status as string)) {
        return res.status(400).json({ error: 'Invalid status value' });
      }
      filters.status = status as CancellationRequestStatus;
    }

    if (orderId) filters.orderId = orderId as string;
    if (requestedById) filters.requestedById = requestedById as string;
    if (limit) filters.limit = parseInt(limit as string, 10);
    if (skip) filters.skip = parseInt(skip as string, 10);

    const result = await getCancellationRequests(filters);

    return res.json(result);
  } catch (error: any) {
    logger.error({ error }, 'Failed to fetch cancellation requests');
    return res.status(500).json({ error: 'Failed to fetch cancellation requests' });
  }
}

/**
 * GET /api/cancellation-requests/:requestId
 * Get a specific cancellation request by ID
 * RBAC: All authenticated users
 */
export async function getCancellationRequest(req: AuthenticatedRequest, res: Response) {
  const { requestId } = req.params;

  try {
    const request = await getCancellationRequestById(requestId);

    if (!request) {
      return res.status(404).json({ error: 'Cancellation request not found' });
    }

    return res.json(request);
  } catch (error: any) {
    logger.error({ error, requestId }, 'Failed to fetch cancellation request');
    return res.status(500).json({ error: 'Failed to fetch cancellation request' });
  }
}
