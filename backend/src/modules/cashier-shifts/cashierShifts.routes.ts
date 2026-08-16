import { Router } from 'express';
import * as ShiftController from './cashierShifts.controller';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import { openShiftSchema, closeShiftSchema } from './cashierShifts.schema';
import { Role } from '@prisma/client';

const router = Router();

// All shift endpoints require authentication
router.use(requireAuth);

// Open shift — CASHIER, MANAGER, OWNER
router.post(
  '/',
  requireRole([Role.CASHIER, Role.MANAGER, Role.OWNER]),
  validate(openShiftSchema),
  ShiftController.openShift
);

// Get current shift — CASHIER, MANAGER, OWNER
router.get(
  '/current',
  requireRole([Role.CASHIER, Role.MANAGER, Role.OWNER]),
  ShiftController.getCurrentShift
);

// Get all open shifts — MANAGER, OWNER
router.get(
  '/open',
  requireRole([Role.MANAGER, Role.OWNER]),
  ShiftController.getOpenShifts
);

// Shift history — MANAGER, OWNER, CASHIER
router.get(
  '/history',
  requireRole([Role.CASHIER, Role.MANAGER, Role.OWNER]),
  ShiftController.getShiftHistory
);

// Close shift — CASHIER, MANAGER, OWNER
router.post(
  '/:id/close',
  requireRole([Role.CASHIER, Role.MANAGER, Role.OWNER]),
  validate(closeShiftSchema),
  ShiftController.closeShift
);

export default router;
