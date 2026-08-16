import { Router } from 'express';
import * as VarianceReviewController from './varianceReview.controller';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import { reviewVarianceSchema } from './varianceReview.schema';
import { Role } from '@prisma/client';

const router = Router();

router.use(requireAuth);

// Get all pending variance reviews — MANAGER, OWNER
router.get(
  '/pending',
  requireRole([Role.MANAGER, Role.OWNER]),
  VarianceReviewController.getPendingReviews
);

// Review (approve/reject) a variance — MANAGER, OWNER
router.post(
  '/:id/review',
  requireRole([Role.MANAGER, Role.OWNER]),
  validate(reviewVarianceSchema),
  VarianceReviewController.reviewVariance
);

export default router;
