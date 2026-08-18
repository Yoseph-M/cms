import { Router } from 'express';
import { requireAgentAuth, requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { Role } from '@prisma/client';
import { claimPrintJob, ackPrintJob, getPendingJobs, retryPrintJob, reprintOrder } from './print-jobs.controller';
import { reprintLimiter } from '../../middleware/rate-limit.middleware';

const router = Router();

// Agent endpoints
router.get('/pending', requireAgentAuth, getPendingJobs);
router.post('/:jobId/claim', requireAgentAuth, claimPrintJob);
router.post('/:jobId/ack', requireAgentAuth, ackPrintJob);

// Owner/Manager endpoints
router.post('/:jobId/retry', requireAuth, requireRole([Role.OWNER, Role.MANAGER]), retryPrintJob);
router.post('/reprint/:orderId', requireAuth, requireRole([Role.OWNER, Role.MANAGER, Role.CASHIER]), reprintLimiter, reprintOrder);

export default router;
