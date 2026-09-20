import { Router } from 'express';
import * as DailyCloseController from './dailyClose.controller';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import { reviewDailyCloseSchema } from './dailyClose.schema';
import { Role } from '@prisma/client';

const router = Router();

router.use(requireAuth);

// Get current business date (server-authoritative) — ALL ROLES
router.get(
  '/business-date',
  DailyCloseController.getCurrentBusinessDate
);

// Current close state — the cashier needs to see whether their request is
// waiting, approved, or disapproved, so this is readable by every operator.
router.get(
  '/current',
  requireRole([Role.OWNER, Role.MANAGER, Role.CASHIER]),
  DailyCloseController.getCurrentStatus
);

// Live totals for the current business day (no writes) — the End of Day screens
// show these so they always reflect today, not an older snapshot.
router.get(
  '/preview',
  requireRole([Role.OWNER, Role.MANAGER, Role.CASHIER]),
  DailyCloseController.previewDailyClose
);

// Day-by-day revenue history — the approver sees what every past day produced.
// Same read surface as /current: cashiers see their own requests' outcomes,
// but the decision routes below remain the manager's call.
// NOTE: registered before the /:date/* param routes so "history" is never
// parsed as a business date.
router.get(
  '/history',
  requireRole([Role.OWNER, Role.MANAGER, Role.CASHIER]),
  DailyCloseController.getDailyCloseHistory
);

// Request the close: whoever is on the floor at the end of service sends it,
// and a manager decides. The server snapshots the day's totals.
router.post(
  '/:date/start',
  requireRole([Role.OWNER, Role.MANAGER, Role.CASHIER]),
  DailyCloseController.startDailyClose
);

// Approve / disapprove the request — the manager's call, and the only thing
// that locks the day. No integrity gate, no cash variance step.
router.post(
  '/:date/approve',
  requireRole([Role.OWNER, Role.MANAGER]),
  validate(reviewDailyCloseSchema),
  DailyCloseController.approveDailyClose
);
router.post(
  '/:date/reject',
  requireRole([Role.OWNER, Role.MANAGER]),
  validate(reviewDailyCloseSchema),
  DailyCloseController.rejectDailyClose
);

// Backwards-compatible alias for "approve" — older clients still call it
// "finalize".
router.post(
  '/:date/finalize',
  requireRole([Role.OWNER, Role.MANAGER]),
  validate(reviewDailyCloseSchema),
  DailyCloseController.approveDailyClose
);

export default router;
