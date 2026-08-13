import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  createCancellationRequest,
  approveCancellationRequest,
  rejectCancellationRequest,
  listCancellationRequests,
  getCancellationRequest,
} from './cancellation.controller';
import {
  createCancellationRequestSchema,
  rejectCancellationRequestSchema,
} from '../schemas';

const router = Router();

/**
 * POST /api/orders/:orderId/cancellation-request
 * Request cancellation for an order
 * RBAC: WAITER, CASHIER, MANAGER, OWNER (anyone can request)
 */
router.post(
  '/orders/:orderId/cancellation-request',
  authenticate,
  requireRole(['WAITER', 'CASHIER', 'MANAGER', 'OWNER']),
  validate(createCancellationRequestSchema),
  createCancellationRequest
);

/**
 * GET /api/cancellation-requests
 * List cancellation requests with filters
 * RBAC: All authenticated users
 */
router.get(
  '/cancellation-requests',
  authenticate,
  listCancellationRequests
);

/**
 * GET /api/cancellation-requests/:requestId
 * Get specific cancellation request
 * RBAC: All authenticated users
 */
router.get(
  '/cancellation-requests/:requestId',
  authenticate,
  getCancellationRequest
);

/**
 * PATCH /api/cancellation-requests/:requestId/approve
 * Approve a cancellation request
 * RBAC: MANAGER, OWNER only
 */
router.patch(
  '/cancellation-requests/:requestId/approve',
  authenticate,
  requireRole(['MANAGER', 'OWNER']),
  approveCancellationRequest
);

/**
 * PATCH /api/cancellation-requests/:requestId/reject
 * Reject a cancellation request
 * RBAC: MANAGER, OWNER only
 */
router.patch(
  '/cancellation-requests/:requestId/reject',
  authenticate,
  requireRole(['MANAGER', 'OWNER']),
  validate(rejectCancellationRequestSchema),
  rejectCancellationRequest
);

export default router;
