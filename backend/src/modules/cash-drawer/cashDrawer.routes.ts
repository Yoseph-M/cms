import { Router } from 'express';
import * as CashDrawerController from './cashDrawer.controller';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import { cashDrawerEventSchema } from '../cashier-shifts/cashierShifts.schema';
import { Role } from '@prisma/client';

const router = Router();

router.use(requireAuth);

// Record a cash drawer entry — CASHIER, MANAGER, OWNER
router.post(
  '/:shiftId/entries',
  requireRole([Role.CASHIER, Role.MANAGER, Role.OWNER]),
  validate(cashDrawerEventSchema),
  CashDrawerController.createEntry
);

// Get ledger for a shift — CASHIER, MANAGER, OWNER
router.get(
  '/:shiftId',
  requireRole([Role.CASHIER, Role.MANAGER, Role.OWNER]),
  CashDrawerController.getLedger
);

export default router;
