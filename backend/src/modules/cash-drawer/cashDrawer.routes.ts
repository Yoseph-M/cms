import { Router } from 'express';
import * as CashDrawerController from './cashDrawer.controller';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import { z } from 'zod';
import { Role } from '@prisma/client';

const router = Router();

router.use(requireAuth);

// Validation schemas
const payoutSchema = z.object({
  shiftId: z.string().min(1, 'shiftId is required'),
  amountMinor: z.number().int().positive('Amount must be positive'),
  reason: z.string().min(1, 'Reason is required'),
  reference: z.string().optional(),
});

const pettyCashSchema = z.object({
  shiftId: z.string().min(1, 'shiftId is required'),
  amountMinor: z.number().int().positive('Amount must be positive'),
  reason: z.string().min(1, 'Reason is required'),
  category: z.string().optional(),
});

const adjustmentSchema = z.object({
  shiftId: z.string().min(1, 'shiftId is required'),
  amountMinor: z.number().int().refine(val => val !== 0, 'Amount cannot be zero'),
  reason: z.string().min(1, 'Reason is required'),
});

// Record cash payout — CASHIER, MANAGER, OWNER
router.post(
  '/payout',
  requireRole([Role.CASHIER, Role.MANAGER, Role.OWNER]),
  validate(payoutSchema),
  CashDrawerController.recordPayout
);

// Record petty cash — MANAGER, OWNER
router.post(
  '/petty-cash',
  requireRole([Role.MANAGER, Role.OWNER]),
  validate(pettyCashSchema),
  CashDrawerController.recordPettyCash
);

// Record cash adjustment — OWNER only
router.post(
  '/adjustment',
  requireRole([Role.OWNER]),
  validate(adjustmentSchema),
  CashDrawerController.recordAdjustment
);

// Get ledger for a shift — CASHIER, MANAGER, OWNER
router.get(
  '/:shiftId',
  requireRole([Role.CASHIER, Role.MANAGER, Role.OWNER]),
  CashDrawerController.getLedger
);

export default router;
