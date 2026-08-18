/**
 * Daily Close Service
 * 
 * Manages the End of Day process.
 * Verifies all shifts are closed, all variances reviewed, and integrity checks pass
 * before finalizing the day's operations.
 * 
 * CRITICAL SECURITY: Daily Close Totals are SERVER-AUTHORITATIVE
 * ===============================================================
 * All financial totals are CALCULATED FROM DATABASE, never accepted from client.
 * This prevents:
 * - UI calculation bugs corrupting financial records
 * - Intentional manipulation of daily totals
 * - Race conditions between UI and database state
 * 
 * The workflow is:
 * 1. startDailyClose: CALCULATES all totals from database → PENDING_REVIEW
 * 2. finalizeDailyClose: Changes status to CLOSED (NO recalculation, totals are immutable)
 * 
 * NEVER accept totals from request body! All calculations happen in startDailyClose.
 */

import { prisma } from '../../services/prisma.service';
import { recordAudit, SYSTEM_USER_ID } from '../../services/audit.service';
import { emitToRoom } from '../../services/socket.service';
import { DailyCloseStatus, ShiftStatus, VarianceReviewStatus } from '@prisma/client';
import { executeInCriticalTransaction } from '../../utils/transaction';
import { ValidationError, ConflictError, NotFoundError } from '../../utils/errors';
import { runIntegrityChecks } from '../integrity/integrity.service';
import { getCurrentBusinessDate, getBusinessDayStart, getBusinessDayEnd, validateNotFuture } from '../../utils/businessTime';

export async function getCurrentDailyClose(businessDate?: string) {
  // Server-authoritative: use server's business date if not provided
  const dateStr = businessDate || getCurrentBusinessDate();
  
  // Validate date is not in the future (prevent time-travel attacks)
  if (!validateNotFuture(dateStr)) {
    throw new ValidationError(
      `Business date ${dateStr} is in the future. Current business date is ${getCurrentBusinessDate()}`,
      'businessDate'
    );
  }

  return prisma.dailyClose.findUnique({
    where: { businessDate: dateStr },
    include: { closedBy: { select: { id: true, name: true, role: true } } },
  });
}

interface StartDailyCloseParams {
  businessDate: string;
  // NO financial totals accepted! All calculated from database.
}

/**
 * Start the daily close process
 * 
 * SERVER-AUTHORITATIVE TOTALS:
 * This function calculates ALL financial totals from the database.
 * It NEVER accepts totals from the client. This is critical for:
 * - Financial integrity (prevents UI bugs from corrupting records)
 * - Security (prevents intentional manipulation)
 * - Auditability (database is single source of truth)
 * 
 * Process:
 * 1. Validate preconditions (integrity checks, shifts closed, variances reviewed)
 * 2. Query database for all orders, settlements, shifts within business day
 * 3. Calculate totals from queried records (in-memory aggregation)
 * 4. Upsert DailyClose with calculated totals → status: PENDING_REVIEW
 * 
 * The calculated totals become immutable after this step.
 * finalizeDailyClose only changes status, never recalculates.
 */
export async function startDailyClose(params: StartDailyCloseParams) {
  const { businessDate } = params;

  // Validate date format and not in future
  if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
    throw new ValidationError('Business date must be in YYYY-MM-DD format', 'businessDate');
  }
  
  if (!validateNotFuture(businessDate)) {
    throw new ValidationError(
      `Cannot start daily close for future date ${businessDate}. Current business date is ${getCurrentBusinessDate()}`,
      'businessDate'
    );
  }

  // 1. Run Integrity Engine - Check for CRITICAL issues only
  // WARNING and ERROR issues don't block daily close (can be investigated later)
  // CRITICAL issues MUST be resolved before closing (data corruption risk)
  const integrityResult = await runIntegrityChecks();
  
  if (integrityResult.issuesFound > 0) {
    // Check if any CRITICAL issues exist
    const criticalIssues = await prisma.integrityIssue.findMany({
      where: {
        resolved: false,
        severity: 'CRITICAL',
      },
      select: {
        id: true,
        category: true,
        description: true,
        severity: true,
      },
    });
    
    if (criticalIssues.length > 0) {
      const issueList = criticalIssues
        .map(i => `- ${i.category}: ${i.description}`)
        .join('\n');
      
      throw new ConflictError(
        `Cannot start daily close. ${criticalIssues.length} CRITICAL integrity issues must be resolved first:\n${issueList}`,
        'CRITICAL_INTEGRITY_ISSUES'
      );
    }
    
    // Non-CRITICAL issues exist but don't block
    // Log for visibility
    const nonCriticalCount = integrityResult.issuesFound - criticalIssues.length;
    if (nonCriticalCount > 0) {
      await recordAudit({
        actorId: SYSTEM_USER_ID,
        actionType: 'DAILY_CLOSE_WITH_WARNINGS',
        targetType: 'DailyClose',
        details: {
          businessDate,
          nonCriticalIssues: nonCriticalCount,
          message: 'Daily close proceeding with non-critical integrity issues',
        },
      });
    }
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

  // Calculate aggregates using server-authoritative date boundaries
  const todayStart = getBusinessDayStart(new Date(businessDate));
  const todayEnd = getBusinessDayEnd(new Date(businessDate));

  // Query ALL relevant records for the business day (single source of truth)
  const [orders, settlements, shifts] = await Promise.all([
    prisma.order.findMany({
      where: { createdAt: { gte: todayStart, lte: todayEnd } },
    }),
    prisma.settlement.findMany({
      where: { createdAt: { gte: todayStart, lte: todayEnd } },
    }),
    prisma.cashierShift.findMany({
      where: { openedAt: { gte: todayStart, lte: todayEnd } },
    }),
  ]);

  // SERVER-AUTHORITATIVE CALCULATIONS (in-memory aggregation from database records)
  // These totals are NEVER accepted from client - always calculated here
  
  // Sales totals
  const totalSalesMinor = orders.reduce((sum, o) => sum + o.totalAmount, 0);
  const totalSettledMinor = settlements.reduce((sum, s) => sum + s.amountMinor, 0);

  // Settlement breakdowns by payment method
  const cashSettledMinor = settlements.filter(s => s.method === 'CASH').reduce((sum, s) => sum + s.amountMinor, 0);
  const cardSettledMinor = settlements.filter(s => s.method === 'CARD').reduce((sum, s) => sum + s.amountMinor, 0);
  const mobileSettledMinor = settlements.filter(s => s.method === 'MOBILE').reduce((sum, s) => sum + s.amountMinor, 0);
  const otherSettledMinor = settlements.filter(s => s.method === 'NONE').reduce((sum, s) => sum + s.amountMinor, 0);

  // Cash drawer totals from shifts
  const cashExpectedMinor = shifts.reduce((sum, s) => sum + (s.expectedCashMinor || 0), 0);
  const cashDeclaredMinor = shifts.reduce((sum, s) => sum + (s.declaredCashMinor || 0), 0);
  const cashVarianceMinor = shifts.reduce((sum, s) => sum + (s.varianceMinor || 0), 0);

  // Order status counts
  const unsettledOrderCount = orders.filter(o => o.settlementStatus === 'UNSETTLED').length;
  const partialSettlementCount = orders.filter(o => o.settlementStatus === 'PARTIALLY_SETTLED').length;
  const cancelledOrderCount = orders.filter(o => o.status === 'CANCELLED').length;

  // Snapshot calculated totals (immutable after this point)
  // NOTE: upsert allows recalculation IF status is PENDING_REVIEW
  // but will fail via middleware if status is CLOSED
  return prisma.dailyClose.upsert({
    where: { businessDate },
    update: {
      // Update totals if re-running (e.g., after fixing data issues)
      // This will FAIL if status = CLOSED (middleware protection)
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
      // First-time calculation: snapshot all totals
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
  idempotencyKey?: string;
  // NO financial totals accepted! Uses snapshot from startDailyClose.
}

/**
 * Finalize the daily close
 * 
 * IMMUTABLE TOTALS:
 * This function does NOT recalculate any totals. It only:
 * 1. Validates the day is in PENDING_REVIEW status
 * 2. Changes status to CLOSED
 * 3. Records who closed it and when
 * 
 * The financial totals calculated by startDailyClose remain unchanged.
 * This ensures the reviewed totals are exactly what gets finalized.
 * 
 * Idempotency: If called multiple times with same key, returns existing record.
 */
export async function finalizeDailyClose(params: FinalizeDailyCloseParams) {
  const { businessDate, closedById, reviewNotes, idempotencyKey } = params;

  // Validate date is not in future
  if (!validateNotFuture(businessDate)) {
    throw new ValidationError(
      `Cannot finalize future date ${businessDate}. Current business date is ${getCurrentBusinessDate()}`,
      'businessDate'
    );
  }

  const result = await executeInCriticalTransaction(prisma, async (tx) => {
    // Check idempotency key first (inside transaction)
    if (idempotencyKey) {
      const existing = await tx.dailyClose.findFirst({
        where: { idempotencyKey },
      });
      
      if (existing) {
        return existing;
      }
    }

    // Re-check for CRITICAL integrity issues (defensive check)
    // Prevents finalization if CRITICAL issues emerged after starting
    const criticalIssues = await tx.integrityIssue.findMany({
      where: {
        resolved: false,
        severity: 'CRITICAL',
      },
      select: {
        id: true,
        category: true,
        description: true,
      },
    });
    
    if (criticalIssues.length > 0) {
      const issueList = criticalIssues
        .map(i => `- ${i.category}: ${i.description}`)
        .join('\n');
      
      throw new ConflictError(
        `Cannot finalize daily close. ${criticalIssues.length} CRITICAL integrity issues detected:\n${issueList}\n\nResolve these issues before finalizing.`,
        'CRITICAL_INTEGRITY_ISSUES'
      );
    }

    const dailyClose = await tx.dailyClose.findUnique({
      where: { businessDate },
    });

    if (!dailyClose) {
      throw new NotFoundError('DailyClose', businessDate);
    }

    // Immutability check: prevent modifying CLOSED days
    if (dailyClose.status === DailyCloseStatus.CLOSED) {
      throw new ConflictError(
        `Business date ${businessDate} is already closed. Daily close records are immutable after finalization.`,
        'ALREADY_CLOSED'
      );
    }

    if (dailyClose.status !== DailyCloseStatus.PENDING_REVIEW) {
      throw new ConflictError(
        `Daily close must be started first (current: ${dailyClose.status})`,
        'NOT_READY_FOR_CLOSE'
      );
    }

    const updated = await tx.dailyClose.update({
      where: { businessDate },
      data: {
        status: DailyCloseStatus.CLOSED,
        closedById,
        closedAt: new Date(),
        reviewNotes,
        idempotencyKey,
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
