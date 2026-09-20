/**
 * Daily Close Service
 *
 * The End of Day flow is a two-step approval:
 *
 *  1. A cashier (or any operator on the floor) sends a close *request*. The
 *     server snapshots the day's totals from the database and parks the day in
 *     PENDING_REVIEW. Managers are notified that a request is waiting.
 *  2. A manager approves the request (→ CLOSED) or disapproves it (→ REJECTED,
 *     with a reason). The requesting cashier is notified either way, and a
 *     rejected day can simply be requested again.
 *
 * There is deliberately no integrity gate and no cash variance step here: the
 * manager is the approver, and the only thing that locks the day is their
 * decision.
 *
 * CRITICAL SECURITY: Daily Close Totals are SERVER-AUTHORITATIVE
 * ===============================================================
 * All financial totals are CALCULATED FROM DATABASE, never accepted from client.
 * This prevents:
 * - UI calculation bugs corrupting financial records
 * - Intentional manipulation of daily totals
 * - Race conditions between UI and database state
 *
 * NEVER accept totals from the request body! All calculations happen in
 * startDailyClose.
 */

import { prisma } from '../../services/prisma.service';
import { recordAudit } from '../../services/audit.service';
import { emitToRoom } from '../../services/socket.service';
import { createNotification } from '../../services/notification.service';
import { DailyCloseStatus, Role, NotificationType } from '@prisma/client';
import { executeInCriticalTransaction } from '../../utils/transaction';
import { ValidationError, ConflictError, NotFoundError } from '../../utils/errors';
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
    include: {
      closedBy: { select: { id: true, name: true, role: true } },
      requestedBy: { select: { id: true, name: true, role: true } },
    },
  });
}

interface DayTotals {
  totalSalesMinor: number;
  totalSettledMinor: number;
  cashSettledMinor: number;
  cardSettledMinor: number;
  mobileSettledMinor: number;
  otherSettledMinor: number;
  cashExpectedMinor: number;
  unsettledOrderCount: number;
  partialSettlementCount: number;
  cancelledOrderCount: number;
}

/**
 * Aggregate one business day's figures straight from the database.
 *
 * The window is always that date's OWN business day — never a running total and
 * never a cached value — so both the live preview and the request snapshot see
 * the same numbers for the same date.
 *
 * Cancelled tickets are counted separately (cancelledOrderCount) and excluded
 * from sales: a ticket that was voided is not revenue.
 */
export async function computeDayTotals(businessDate: string): Promise<DayTotals> {
  const dayStart = getBusinessDayStart(new Date(businessDate));
  const dayEnd = getBusinessDayEnd(new Date(businessDate));

  const [orders, settlements] = await Promise.all([
    prisma.order.findMany({
      where: { createdAt: { gte: dayStart, lte: dayEnd } },
    }),
    prisma.settlement.findMany({
      where: { createdAt: { gte: dayStart, lte: dayEnd } },
    }),
  ]);

  const salesOrders = orders.filter(o => o.status !== 'CANCELLED');

  const totalSalesMinor = salesOrders.reduce((sum, o) => sum + o.totalAmount, 0);
  const totalSettledMinor = settlements.reduce((sum, s) => sum + s.amountMinor, 0);

  const sumByMethod = (method: 'CASH' | 'CARD' | 'MOBILE' | 'NONE') =>
    settlements.filter(s => s.method === method).reduce((sum, s) => sum + s.amountMinor, 0);

  const cashSettledMinor = sumByMethod('CASH');

  return {
    totalSalesMinor,
    totalSettledMinor,
    cashSettledMinor,
    cardSettledMinor: sumByMethod('CARD'),
    mobileSettledMinor: sumByMethod('MOBILE'),
    otherSettledMinor: sumByMethod('NONE'),
    // Kept for reporting only: approval no longer asks anyone to count the
    // drawer, so there is no declared figure and no variance.
    cashExpectedMinor: cashSettledMinor,
    unsettledOrderCount: salesOrders.filter(o => o.settlementStatus === 'UNSETTLED').length,
    partialSettlementCount: salesOrders.filter(o => o.settlementStatus === 'PARTIALLY_SETTLED').length,
    cancelledOrderCount: orders.filter(o => o.status === 'CANCELLED').length,
  };
}

/**
 * Live figures for the day an operator is about to close, without writing
 * anything. The End of Day screens show this so "today's sales" are always the
 * current date's own numbers — before a request exists, and after one is
 * disapproved.
 */
export async function previewDailyClose(businessDate?: string): Promise<DayTotals & { businessDate: string }> {
  const dateStr = businessDate && /^\d{4}-\d{2}-\d{2}$/.test(businessDate)
    ? businessDate
    : getCurrentBusinessDate();

  if (!validateNotFuture(dateStr)) {
    throw new ValidationError(
      `Business date ${dateStr} is in the future. Current business date is ${getCurrentBusinessDate()}`,
      'businessDate'
    );
  }

  return { businessDate: dateStr, ...(await computeDayTotals(dateStr)) };
}

interface StartDailyCloseParams {
  businessDate: string;
  /** The operator (usually the cashier) asking the manager to close the day. */
  requestedById: string;
  // NO financial totals accepted! All calculated from database.
}

/**
 * Send the request to close the day.
 *
 * SERVER-AUTHORITATIVE TOTALS:
 * This function calculates ALL financial totals from the database.
 * It NEVER accepts totals from the client. This is critical for:
 * - Financial integrity (prevents UI bugs from corrupting records)
 * - Security (prevents intentional manipulation)
 * - Auditability (database is single source of truth)
 *
 * No integrity checks run here: approval is the manager's call, not the
 * integrity engine's. The calculated totals are re-derived on every request, so
 * a day that was rejected (and traded more sales before being retried) is
 * re-snapshotted rather than reusing a stale figure.
 */
export async function startDailyClose(params: StartDailyCloseParams) {
  const { businessDate, requestedById } = params;

  // Validate date format and not in future
  if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
    throw new ValidationError('Business date must be in YYYY-MM-DD format', 'businessDate');
  }

  if (!validateNotFuture(businessDate)) {
    throw new ValidationError(
      `Cannot request a close for future date ${businessDate}. Current business date is ${getCurrentBusinessDate()}`,
      'businessDate'
    );
  }

  // A finalized day is immutable — never reopen it by re-requesting.
  const existing = await prisma.dailyClose.findUnique({ where: { businessDate } });
  if (existing?.status === DailyCloseStatus.CLOSED) {
    throw new ConflictError(
      `Business date ${businessDate} is already closed. Daily close records are immutable after approval.`,
      'ALREADY_CLOSED'
    );
  }

  // SERVER-AUTHORITATIVE CALCULATIONS — always this date's own business day,
  // never a running total and never accepted from the client.
  const {
    totalSalesMinor,
    totalSettledMinor,
    cashSettledMinor,
    cardSettledMinor,
    mobileSettledMinor,
    otherSettledMinor,
    cashExpectedMinor,
    unsettledOrderCount,
    partialSettlementCount,
    cancelledOrderCount,
  } = await computeDayTotals(businessDate);

  const snapshot = {
    totalSalesMinor,
    totalSettledMinor,
    cashSettledMinor,
    cardSettledMinor,
    mobileSettledMinor,
    otherSettledMinor,
    cashExpectedMinor,
    unsettledOrderCount,
    partialSettlementCount,
    cancelledOrderCount,
    status: DailyCloseStatus.PENDING_REVIEW,
    requestedById,
    requestedAt: new Date(),
    reviewNotes: null,
  };

  const dailyClose = await prisma.dailyClose.upsert({
    where: { businessDate },
    update: snapshot,
    create: {
      businessDate,
      cashDeclaredMinor: 0,
      cashVarianceMinor: 0,
      ...snapshot,
    },
  });

  // Tell the floor a decision is waiting on the manager's desk.
  const requester = await prisma.user.findUnique({
    where: { id: requestedById },
    select: { name: true },
  });

  // Target the decision-maker: the manager approves or disapproves. (Owners
  // still see the final decision through the audit trail.)
  await createNotification({
    type: NotificationType.DAILY_CLOSE_REQUESTED,
    message: `${requester?.name ?? 'A cashier'} requested to close ${businessDate}. Approve or disapprove it in End of Day.`,
    severity: 'warning',
    recipientRole: Role.MANAGER,
    relatedId: dailyClose.id,
  });

  emitToRoom('managers', 'daily-close:requested', {
    id: dailyClose.id,
    businessDate,
  });

  await recordAudit({
    actorId: requestedById,
    actionType: 'DAILY_CLOSE_REQUESTED',
    targetType: 'DailyClose',
    targetId: dailyClose.id,
    details: { businessDate, totalSalesMinor, totalSettledMinor },
  });

  return dailyClose;
}

interface DecideDailyCloseParams {
  businessDate: string;
  /** The manager (or owner) making the call. */
  decidedById: string;
  reviewNotes?: string;
  idempotencyKey?: string;
}

/**
 * Approve the close request — this is the step that locks the day.
 *
 * TOTALS ARE IMMUTABLE:
 * Nothing is recalculated here. The snapshot taken when the request was sent is
 * exactly what gets approved; this function only records the decision.
 */
export async function approveDailyClose(params: DecideDailyCloseParams) {
  const { businessDate, decidedById, reviewNotes, idempotencyKey } = params;

  if (!validateNotFuture(businessDate)) {
    throw new ValidationError(
      `Cannot approve future date ${businessDate}. Current business date is ${getCurrentBusinessDate()}`,
      'businessDate'
    );
  }

  const result = await executeInCriticalTransaction(prisma, async (tx) => {
    // Check idempotency key first (inside transaction)
    if (idempotencyKey) {
      const existing = await tx.dailyClose.findFirst({ where: { idempotencyKey } });
      if (existing) {
        return existing;
      }
    }

    const dailyClose = await tx.dailyClose.findUnique({ where: { businessDate } });
    if (!dailyClose) {
      throw new NotFoundError('DailyClose', businessDate);
    }

    // Immutability check: prevent modifying an approved day
    if (dailyClose.status === DailyCloseStatus.CLOSED) {
      throw new ConflictError(
        `Business date ${businessDate} is already closed. Daily close records are immutable after approval.`,
        'ALREADY_CLOSED'
      );
    }

    if (dailyClose.status !== DailyCloseStatus.PENDING_REVIEW) {
      throw new ConflictError(
        `There is no open close request for ${businessDate} to approve.`,
        'NOT_READY_FOR_CLOSE'
      );
    }

    return tx.dailyClose.update({
      where: { businessDate },
      data: {
        status: DailyCloseStatus.CLOSED,
        closedById: decidedById,
        closedAt: new Date(),
        reviewNotes,
        idempotencyKey,
      },
    });
  });

  await notifyDecision(result, decidedById, 'approved');
  return result;
}

/**
 * Disapprove the close request. The day returns to the floor so the operator can
 * fix whatever was wrong and send a fresh request.
 */
export async function rejectDailyClose(params: DecideDailyCloseParams) {
  const { businessDate, decidedById, reviewNotes } = params;

  if (!validateNotFuture(businessDate)) {
    throw new ValidationError(
      `Cannot reject future date ${businessDate}. Current business date is ${getCurrentBusinessDate()}`,
      'businessDate'
    );
  }

  const dailyClose = await prisma.dailyClose.findUnique({ where: { businessDate } });
  if (!dailyClose) {
    throw new NotFoundError('DailyClose', businessDate);
  }

  if (dailyClose.status === DailyCloseStatus.CLOSED) {
    throw new ConflictError(
      `Business date ${businessDate} is already closed and can no longer be disapproved.`,
      'ALREADY_CLOSED'
    );
  }

  if (dailyClose.status !== DailyCloseStatus.PENDING_REVIEW) {
    throw new ConflictError(
      `There is no open close request for ${businessDate} to disapprove.`,
      'NOT_READY_FOR_CLOSE'
    );
  }

  const updated = await prisma.dailyClose.update({
    where: { businessDate },
    data: {
      status: DailyCloseStatus.REJECTED,
      closedById: decidedById,
      closedAt: new Date(),
      reviewNotes,
    },
  });

  await notifyDecision(updated, decidedById, 'disapproved');
  return updated;
}

/** Notify the cashier who asked, and log who decided what. */
async function notifyDecision(
  dailyClose: { id: string; businessDate: string; requestedById: string | null },
  decidedById: string,
  verb: 'approved' | 'disapproved',
) {
  const decider = await prisma.user.findUnique({
    where: { id: decidedById },
    select: { name: true },
  });

  await createNotification({
    type: NotificationType.DAILY_CLOSE_DECISION,
    message: `${decider?.name ?? 'A manager'} ${verb} the End of Day close for ${dailyClose.businessDate}.`,
    severity: verb === 'approved' ? 'info' : 'warning',
    // Target the requesting cashier specifically when we know who they are.
    recipientRole: Role.CASHIER,
    relatedId: dailyClose.id,
  });

  emitToRoom('managers', 'daily-close:completed', {
    id: dailyClose.id,
    businessDate: dailyClose.businessDate,
  });

  await recordAudit({
    actorId: decidedById,
    actionType: verb === 'approved' ? 'DAILY_CLOSE_COMPLETED' : 'DAILY_CLOSE_REJECTED',
    targetType: 'DailyClose',
    targetId: dailyClose.id,
    details: { businessDate: dailyClose.businessDate, decision: verb },
  });
}

/**
 * Backwards-compatible alias. Older clients (and the swagger docs) still call
 * this endpoint "finalize"; the meaning is now simply "approve".
 */
export const finalizeDailyClose = approveDailyClose;

export interface DailyCloseHistoryRow {
  id: string;
  businessDate: string;
  status: DailyCloseStatus;
  totalSalesMinor: number;
  totalSettledMinor: number;
  cashSettledMinor: number;
  cardSettledMinor: number;
  mobileSettledMinor: number;
  cancelledOrderCount: number;
  requestedAt: Date | null;
  closedAt: Date | null;
  reviewNotes: string | null;
  requestedByName: string | null;
  closedByName: string | null;
}

/**
 * Day-by-day revenue history for the End of Day screen.
 *
 * Every snapshot the floor has ever sent lives here, including days that were
 * never approved — a REJECTED day still shows what the till *thought* it took,
 * and an OPEN/PENDING day shows the most recent snapshot for that date. The
 * figure that matters for reporting is totalSalesMinor; per-method splits are
 * included so the approver can spot a lopsided day without opening anything.
 *
 * Rows are newest-first and capped (the screen only ever shows recent days);
 * this is a read model — it never writes and never recalculates totals.
 */
export async function listDailyCloseHistory(limit = 30): Promise<DailyCloseHistoryRow[]> {
  const capped = Math.min(90, Math.max(1, limit));

  const rows = await prisma.dailyClose.findMany({
    orderBy: { businessDate: 'desc' },
    take: capped,
    include: {
      requestedBy: { select: { name: true } },
      closedBy: { select: { name: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    businessDate: row.businessDate,
    status: row.status,
    totalSalesMinor: row.totalSalesMinor,
    totalSettledMinor: row.totalSettledMinor,
    cashSettledMinor: row.cashSettledMinor,
    cardSettledMinor: row.cardSettledMinor,
    mobileSettledMinor: row.mobileSettledMinor,
    cancelledOrderCount: row.cancelledOrderCount,
    requestedAt: row.requestedAt,
    closedAt: row.closedAt,
    reviewNotes: row.reviewNotes,
    requestedByName: row.requestedBy?.name ?? null,
    closedByName: row.closedBy?.name ?? null,
  }));
}
