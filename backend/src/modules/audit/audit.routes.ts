import { Router } from 'express';
import * as AnalyticsController from '../analytics/analytics.controller';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { Role } from '@prisma/client';

const router = Router();

router.use(requireAuth);
router.use(requireRole([Role.OWNER]));

router.get('/', AnalyticsController.getAuditLogs);
router.get('/login-history', AnalyticsController.getLoginHistory);

export default router;
