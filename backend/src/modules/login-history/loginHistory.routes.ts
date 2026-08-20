import { Router } from 'express';
import * as LoginHistoryController from './loginHistory.controller';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { Role } from '@prisma/client';

const router = Router();

// All login history endpoints require authentication
router.use(requireAuth);

// Get all login history - OWNER only (for security monitoring)
router.get(
  '/login-history',
  requireRole([Role.OWNER]),
  LoginHistoryController.getAllLoginHistory
);

// Get login statistics - OWNER only
router.get(
  '/login-history/stats',
  requireRole([Role.OWNER]),
  LoginHistoryController.getLoginStats
);

export default router;
