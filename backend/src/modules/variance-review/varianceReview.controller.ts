import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import * as VarianceReviewService from './varianceReview.service';
import { logger } from '../../utils/logger';

/**
 * GET /api/variance/pending
 * Get all pending variance reviews
 */
export async function getPendingReviews(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const reviews = await VarianceReviewService.getPendingReviews();
    return res.json(reviews);
  } catch (error: any) {
    logger.error({ error }, 'Failed to get pending variance reviews');
    return next(error);
  }
}

/**
 * POST /api/variance/:id/review
 * Approve or reject a variance review
 */
export async function reviewVariance(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { status, managerNotes } = req.body;
    const reviewedById = req.user!.userId;

    const review = await VarianceReviewService.reviewVariance({
      reviewId: id,
      status,
      managerNotes,
      reviewedById,
    });

    return res.json(review);
  } catch (error: any) {
    logger.error({ error, reviewId: req.params.id }, 'Failed to review variance');
    return next(error);
  }
}
