/**
 * Variance Review Service
 * 
 * Manages the approval and rejection of cash drawer variances.
 * When a variance is approved, the shift is moved to CLOSED.
 */

import { prisma } from '../../services/prisma.service';
import { recordAudit } from '../../services/audit.service';
import { emitToRoom } from '../../services/socket.service';
import { ShiftStatus, VarianceReviewStatus } from '@prisma/client';
import { executeInCriticalTransaction } from '../../utils/transaction';
import { NotFoundError, ConflictError } from '../../utils/errors';

interface ReviewVarianceParams {
  reviewId: string;
  status: VarianceReviewStatus;
  managerNotes: string;
  reviewedById: string;
}

export async function reviewVariance(params: ReviewVarianceParams) {
  const { reviewId, status, managerNotes, reviewedById } = params;

  if (status === VarianceReviewStatus.PENDING) {
    throw new Error('Cannot review variance to PENDING status');
  }

  const result = await executeInCriticalTransaction(prisma, async (tx) => {
    const review = await tx.varianceReview.findUnique({
      where: { id: reviewId },
      include: { shift: true },
    });

    if (!review) {
      throw new NotFoundError('VarianceReview', reviewId);
    }

    if (review.reviewStatus !== VarianceReviewStatus.PENDING) {
      throw new ConflictError(
        `Variance Review ${reviewId} has already been ${review.reviewStatus}`,
        'REVIEW_ALREADY_PROCESSED'
      );
    }

    if (review.shift.status !== ShiftStatus.PENDING_REVIEW) {
      throw new ConflictError(
        `Shift ${review.shift.id} is not in PENDING_REVIEW state`,
        'SHIFT_NOT_PENDING_REVIEW'
      );
    }

    // Update the review
    const updatedReview = await tx.varianceReview.update({
      where: { id: reviewId },
      data: {
        reviewStatus: status,
        managerNotes,
        reviewedById,
        reviewedAt: new Date(),
      },
    });

    // Update the shift
    await tx.cashierShift.update({
      where: { id: review.shift.id },
      data: {
        status: ShiftStatus.CLOSED,
        reviewedById,
        reviewedAt: new Date(),
      },
    });

    return updatedReview;
  });

  // Audit
  await recordAudit({
    actorId: reviewedById,
    actionType: status === VarianceReviewStatus.APPROVED ? 'VARIANCE_APPROVED' : 'VARIANCE_REJECTED',
    targetType: 'VarianceReview',
    targetId: reviewId,
    details: { shiftId: result.shiftId, status, managerNotes },
  });

  // Socket
  emitToRoom('orders', 'variance:reviewed', {
    id: reviewId,
    shiftId: result.shiftId,
    status,
  });

  return result;
}

export async function getPendingReviews() {
  return prisma.varianceReview.findMany({
    where: { reviewStatus: VarianceReviewStatus.PENDING },
    include: {
      shift: {
        include: { cashier: { select: { id: true, name: true, role: true } } },
      },
    },
    orderBy: { createdAt: 'asc' },
  });
}
