import { Router } from 'express';
import * as SettlementsController from './settlements.controller';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import { createSettlementSchema } from '../schemas';
import { Role } from '@prisma/client';

const router = Router();

// Authentication is applied per-route (not via router.use) because this router is
// mounted at the shared `/api` prefix. A blanket router.use(requireAuth) here would
// also intercept unrelated /api routes mounted later (print agents, health probes).

// Settlement recording - CASHIER, MANAGER, OWNER only
router.post(
  '/orders/:orderId/settlements',
  requireAuth,
  requireRole([Role.CASHIER, Role.MANAGER, Role.OWNER]),
  validate(createSettlementSchema),
  SettlementsController.createSettlement
);

// List settlements for an order - all authenticated users
router.get(
  '/orders/:orderId/settlements',
  requireAuth,
  SettlementsController.listSettlements
);

// Get remaining amount for an order - all authenticated users
router.get(
  '/orders/:orderId/remaining-amount',
  requireAuth,
  SettlementsController.getRemaining
);

// Global settlement history - all authenticated users
router.get(
  '/settlements',
  requireAuth,
  SettlementsController.getAllSettlements
);

// Get specific settlement - all authenticated users
router.get(
  '/settlements/:settlementId',
  requireAuth,
  SettlementsController.getSettlement
);

export default router;
