/**
 * Daily Close Service
 * 
 * Manages the End of Day process.
 * Verifies all shifts are closed, all variances reviewed, and integrity checks pass
 * before finalizing the day's operations.
 */

import { prisma } from '../../services/prisma.service';
import { recordAudit } from '../../services/audit.service';
import { emitToRoom } from '../../services/socket.service';
import { DailyCloseStatus, ShiftStatus, VarianceReviewStatus } from '@prisma/client';
import { executeInCriticalTransaction } from '../../utils/transaction';
import { ValidationError, ConflictError, NotFoundError } from '../../utils/errors';
import { runIntegrityChecks } from '../integrity/integrity.service';

export async function getCurrentDailyClose(businessDate?: string) {
  // If not provided, assume current local date based on server timezone
  const dateStr = businessDate || new Date().toISOString().split('T')[0];

  return prisma.dailyClose.findUnique({
    where: { businessDate: dateStr },
    include: { closedBy: { select: { id: true, name: true, role: true } } },
  });
}

interface StartDailyCloseParams {
  businessDate: string;
}

export async function startDailyClose(params: StartDailyCloseParams) {
  const { businessDate } = params;

  // 1. Run Integrity Engine
  const integrityResult = await runIntegrityChecks();
  if (!integrityResult.passed) {
    throw new ConflictError(
      `Cannot start daily close. ${integrityResult.issuesFound} unresolved integrity issues found.`,
      'INTEGRITY_CHECK_FAILED'
    );
  }

  // 2. Check for open shifts
  const openShifts = await prisma.cashierShift.count({
    where: { status: { in: [ShiftStatus.OPEN, ShiftStatus.PENDING_REVIEW] } },
  });

  if (openShifts > 0) {
    throw new ConflictError(
      `Cannot start daily close. ${openShifts} shifts are still open or pending review.`,
      'SHIFTS_NOT_CLOSED'
    );
  }

  // 3. Verify no unresolved variance reviews
  const pendingReviews = await prisma.varianceReview.count({
    where: { reviewStatus: VarianceReviewStatus.PENDING },
  });

  if (pendingReviews > 0) {
    throw new ConflictError(
      `Cannot start daily close. ${pendingReviews} variance reviews are pending.`,
      'VARIANCES_PENDING'
    );
  }

  // Calculate aggregates
  const todayStart = new Date(`${businessDate}T00:00:00Z`);
  const tomorrowStart = new Date(`${businessDate}T00:00:00Z`);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);

  const [orders, settlements, shifts] = await Promise.all([
    prisma.order.findMany({
      where: { createdAt: { gte: todayStart, lt: tomorrowStart } },
    }),
    prisma.settlement.findMany({
      where: { createdAt: { gte: todayStart, lt: tomorrowStart } },
    }),
    prisma.cashierShift.findMany({
      where: { openedAt: { gte: todayStart, lt: tomorrowStart } },
    }),
  ]);

  const totalSalesMinor = orders.reduce((sum, o) => sum + o.totalAmount, 0);
  const totalSettledMinor = settlements.reduce((sum, s) => sum + s.amountMinor, 0);

  const cashSettledMinor = settlements.filter(s => s.method === 'CASH').reduce((sum, s) => sum + s.amountMinor, 0);
  const cardSettledMinor = settlements.filter(s => s.method === 'CARD').reduce((sum, s) => sum + s.amountMinor, 0);
  const mobileSettledMinor = settlements.filter(s => s.method === 'MOBILE').reduce((sum, s) => sum + s.amountMinor, 0);
  const otherSettledMinor = settlements.filter(s => s.method === 'NONE').reduce((sum, s) => sum + s.amountMinor, 0);

  const cashExpectedMinor = shifts.reduce((sum, s) => sum + (s.expectedCashMinor || 0), 0);
  const cashDeclaredMinor = shifts.reduce((sum, s) => sum + (s.declaredCashMinor || 0), 0);
  const cashVarianceMinor = shifts.reduce((sum, s) => sum + (s.varianceMinor || 0), 0);

  const unsettledOrderCount = orders.filter(o => o.settlementStatus === 'UNSETTLED').length;
  const partialSettlementCount = orders.filter(o => o.settlementStatus === 'PARTIALLY_SETTLED').length;
  const cancelledOrderCount = orders.filter(o => o.status === 'CANCELLED').length;

  return prisma.dailyClose.upsert({
    where: { businessDate },
    update: {
      totalSalesMinor,
      totalSettledMinor,
      cashSettledMinor,
      cardSettledMinor,
      mobileSettledMinor,
      otherSettledMinor,
      cashExpectedMinor,
      cashDeclaredMinor,
      cashVarianceMinor,
      unsettledOrderCount,
      partialSettlementCount,
      cancelledOrderCount,
      status: DailyCloseStatus.PENDING_REVIEW,
    },
    create: {
      businessDate,
      totalSalesMinor,
      totalSettledMinor,
      cashSettledMinor,
      cardSettledMinor,
      mobileSettledMinor,
      otherSettledMinor,
      cashExpectedMinor,
      cashDeclaredMinor,
      cashVarianceMinor,
      unsettledOrderCount,
      partialSettlementCount,
      cancelledOrderCount,
      status: DailyCloseStatus.PENDING_REVIEW,
    },
  });
}

interface FinalizeDailyCloseParams {
  businessDate: string;
  closedById: string;
  reviewNotes?: string;
}

export async function finalizeDailyClose(params: FinalizeDailyCloseParams) {
  const { businessDate, closedById, reviewNotes } = params;

  const result = await executeInCriticalTransaction(prisma, async (tx) => {
    const dailyClose = await tx.dailyClose.findUnique({
      where: { businessDate },
    });

    if (!dailyClose) {
      throw new NotFoundError('DailyClose', businessDate);
    }

    if (dailyClose.status === DailyCloseStatus.CLOSED) {
      throw new ConflictError(`Business date ${businessDate} is already closed`, 'ALREADY_CLOSED');
    }

    if (dailyClose.status !== DailyCloseStatus.PENDING_REVIEW) {
      throw new ConflictError(`Daily close must be started first (current: ${dailyClose.status})`, 'NOT_READY_FOR_CLOSE');
    }

    const updated = await tx.dailyClose.update({
      where: { businessDate },
      data: {
        status: DailyCloseStatus.CLOSED,
        closedById,
        closedAt: new Date(),
        reviewNotes,
      },
    });

    return updated;
  });

  // Audit
  await recordAudit({
    actorId: closedById,
    actionType: 'DAILY_CLOSE_COMPLETED',
    targetType: 'DailyClose',
    targetId: result.id,
    details: { businessDate, totalSalesMinor: result.totalSalesMinor },
  });

  // Socket
  emitToRoom('managers', 'daily-close:completed', {
    id: result.id,
    businessDate,
  });

  return result;
}
