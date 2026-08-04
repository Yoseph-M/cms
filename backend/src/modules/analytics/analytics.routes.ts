import { Router } from 'express';
import * as AnalyticsController from './analytics.controller';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { Role } from '@prisma/client';

const router = Router();

router.use(requireAuth);
router.use(requireRole([Role.OWNER, Role.MANAGER]));

router.get('/sales/daily', AnalyticsController.getDailySales);
router.get('/sales/monthly', AnalyticsController.getMonthlySales);
router.get('/sales/trend', AnalyticsController.getTrendSales);
router.get('/top-items', AnalyticsController.getTopItems);
router.get('/category-split', AnalyticsController.getCategorySplit);
router.get('/peak-hours', AnalyticsController.getPeakHours);
router.get('/payment-methods', AnalyticsController.getPaymentMethods);
router.get('/cancellations', AnalyticsController.getCancellations);
router.get('/staff-performance', AnalyticsController.getStaffPerformance);
router.get('/audit-logs', AnalyticsController.getAuditLogs);

export default router;
