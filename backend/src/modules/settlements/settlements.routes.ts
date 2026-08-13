import { Router } from 'express';
import * as SettlementsController from './settlements.controller';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import { createSettlementSchema } from '../schemas';
import { Role } from '@prisma/client';

const router = Router();

// All settlement endpoints require authentication
router.use(requireAuth);

// Settlement recording - CASHIER, MANAGER, OWNER only
router.post(
  '/orders/:orderId/settlements',
  requireRole([Role.CASHIER, Role.MANAGER, Role.OWNER]),
  validate(createSettlementSchema),
  SettlementsController.createSettlement
);

// List settlements for an order - all authenticated users
router.get(
  '/orders/:orderId/settlements',
  SettlementsController.listSettlements
);

// Get remaining amount for an order - all authenticated users
router.get(
  '/orders/:orderId/remaining-amount',
  SettlementsController.getRemaining
);

// Get specific settlement - all authenticated users
router.get(
  '/settlements/:settlementId',
  SettlementsController.getSettlement
);

export default router;
