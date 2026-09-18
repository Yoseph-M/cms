import { Router } from 'express';
import * as LoginHistoryController from './loginHistory.controller';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { Role } from '@prisma/client';

const router = Router();

// Authentication is applied per-route (not via router.use) because this router is
// mounted at the shared `/api` prefix; a blanket requireAuth would intercept
// unrelated /api routes mounted after it (e.g. print agents and health probes).

// Get all login history - OWNER only (for security monitoring)
router.get(
  '/login-history',
  requireAuth,
  requireRole([Role.OWNER]),
  LoginHistoryController.getAllLoginHistory
);

// Get login statistics - OWNER only
router.get(
  '/login-history/stats',
  requireAuth,
  requireRole([Role.OWNER]),
  LoginHistoryController.getLoginStats
);

export default router;
