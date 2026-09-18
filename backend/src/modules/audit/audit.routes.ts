import { Router } from 'express';
import * as AnalyticsController from '../analytics/analytics.controller';
import * as AuditController from './audit.controller';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { Role } from '@prisma/client';

const router = Router();

router.use(requireAuth);
router.use(requireRole([Role.OWNER]));

// Staff activity and login history as a single time-ordered stream — the admin
// "Audit logs" tab reads this instead of paging the two sources separately.
router.get('/feed', AuditController.getAuditFeed);
router.get('/', AnalyticsController.getAuditLogs);
router.get('/login-history', AnalyticsController.getLoginHistory);

export default router;
