import { Router } from 'express';
import * as DailyCloseController from './dailyClose.controller';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import { finalizeDailyCloseSchema } from './dailyClose.schema';
import { Role } from '@prisma/client';

const router = Router();

router.use(requireAuth);

// Get current business date (server-authoritative) — ALL ROLES
router.get(
  '/business-date',
  DailyCloseController.getCurrentBusinessDate
);

// Get current daily close status — MANAGER, OWNER
router.get(
  '/current',
  requireRole([Role.MANAGER, Role.OWNER]),
  DailyCloseController.getCurrentStatus
);

// Start daily close (calculates everything and verifies constraints) — MANAGER, OWNER
router.post(
  '/:date/start',
  requireRole([Role.MANAGER, Role.OWNER]),
  DailyCloseController.startDailyClose
);

// Finalize daily close — OWNER
router.post(
  '/:date/finalize',
  requireRole([Role.OWNER]),
  validate(finalizeDailyCloseSchema),
  DailyCloseController.finalizeDailyClose
);

export default router;
