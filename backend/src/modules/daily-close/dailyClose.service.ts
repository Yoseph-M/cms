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
import { settledMoneyOn } from '../../services/settlement.service';

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
 * Sales count PAID tickets only — the money the day actually took — so the
 * closed day agrees with what the analytics pages report for the same date.
 * Tickets that are still on the floor (open, in the kitchen, served but
 * unsettled) are reported as counts instead, and a voided ticket is counted as
 * a cancellation, never as revenue.
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

  const paidOrders = orders.filter(o => o.status === 'PAID');
  const liveOrders = orders.filter(o => o.status !== 'CANCELLED');

  const totalSalesMinor = paidOrders.reduce((sum, o) => sum + o.totalAmount, 0);

  // "Total settled" is money that changed hands. A VOID row (method NONE) is
  // the cancellation audit trail — it carries the cancelled ticket's whole
  // value so the void shows on the settlements pages — and counting it here
  // booked a voided ticket as collected cash. Only collection rows count.
  const totalSettledMinor = settledMoneyOn(settlements);

  const sumByMethod = (method: 'CASH' | 'CARD' | 'MOBILE' | 'NONE') =>
    settlements.filter(s => s.method === method).reduce((sum, s) => sum + s.amountMinor, 0);

  const cashSettledMinor = sumByMethod('CASH');

  return {
    totalSalesMinor,
    totalSettledMinor,
    cashSettledMinor,
    cardSettledMinor: sumByMethod('CARD'),
    mobileSettledMinor: sumByMethod('MOBILE'),
    // Kept for the record only: the value of the day's voided tickets. It is
    // deliberately NOT part of totalSettledMinor — nothing was collected on
    // those tickets.
    otherSettledMinor: sumByMethod('NONE'),
    // Kept for reporting only: approval no longer asks anyone to count the
    // drawer, so there is no declared figure and no variance.
    cashExpectedMinor: cashSettledMinor,
    unsettledOrderCount: liveOrders.filter(o => o.settlementStatus === 'UNSETTLED').length,
    partialSettlementCount: liveOrders.filter(o => o.settlementStatus === 'PARTIALLY_SETTLED').length,
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
/* ─────────────────────── Closed-day reconciliation ───────────────────────
 * Every approved day carries the total the manager signed off on. What that
 * day's money IS can be read again at any time from the ledger — PAID tickets,
 * the same business-day window the analytics pages use. Those two figures come
 * from different paths: one is a frozen snapshot, the other is a live read of
 * the orders that are paid *today*. Comparing them is the only way to see a
 * day that no longer agrees with its own close — a ticket cancelled or
 * re-priced after the close, a close taken before the last settlement landed,
 * or a snapshot written before sales were narrowed to paid tickets. Neither
 * screen can show that on its own: the End of Day page only ever prints the
 * snapshot, and the Finance charts only ever print the ledger.
 * ────────────────────────────────────────────────────────────────────────── */

/** A day diverges as soon as its two figures stop matching — whole units here. */
export const RECONCILIATION_THRESHOLD_MINOR = 1;

export interface DayReconciliationRow {
  businessDate: string;
  /** The total locked when the manager approved the close. */
  closedSalesMinor: number;
  /** The same business day's paid revenue, read from the ledger now. */
  paidRevenueMinor: number;
  /** Closed − ledger. Positive: the close claimed money the ledger does not have. */
  deltaMinor: number;
  /** Delta as a share of the ledger figure; null when the ledger is empty. */
  deltaPercent: number | null;
  flagged: boolean;
  closedByName: string | null;
  closedAt: Date | null;
}

export interface ReconciliationReport {
  days: DayReconciliationRow[];
  /** How many closed days the report covers. */
  closedDayCount: number;
  /** How many of them no longer agree with the ledger. */
  flaggedCount: number;
  totals: {
    closedSalesMinor: number;
    paidRevenueMinor: number;
    deltaMinor: number;
  };
  thresholdMinor: number;
}

/**
 * Compare each approved day's takings with that day's paid revenue.
 *
 * Read-only and server-authoritative: nothing here writes, and both sides of
 * the comparison are computed by the server. Days are returned newest first,
 * each one flagged when the two figures differ by at least
 * `RECONCILIATION_THRESHOLD_MINOR`.
 */
export async function reconcileClosedDays(opts: { days?: number } = {}): Promise<ReconciliationReport> {
  const limit = Math.min(180, Math.max(1, Math.floor(opts.days ?? 90)));

  const closed = await prisma.dailyClose.findMany({
    where: { status: DailyCloseStatus.CLOSED },
    orderBy: { businessDate: 'desc' },
    take: limit,
    include: { closedBy: { select: { name: true } } },
  });

  if (closed.length === 0) {
    return {
      days: [],
      closedDayCount: 0,
      flaggedCount: 0,
      totals: { closedSalesMinor: 0, paidRevenueMinor: 0, deltaMinor: 0 },
      thresholdMinor: RECONCILIATION_THRESHOLD_MINOR,
    };
  }

  // Each day gets its OWN business-day window — the same one the close used.
  const windows = closed
    .map((row) => ({
      businessDate: row.businessDate,
      start: getBusinessDayStart(new Date(row.businessDate)).getTime(),
      end: getBusinessDayEnd(new Date(row.businessDate)).getTime(),
    }))
    .sort((a, b) => a.start - b.start);

  // One read of the paid tickets across the whole span, then bucket them by the
  // day that owns the instant. A ticket that falls outside every closed day (a
  // day nobody closed) is deliberately dropped rather than attributed to a
  // neighbour.
  const paidOrders = await prisma.order.findMany({
    where: {
      status: 'PAID',
      createdAt: { gte: new Date(windows[0].start), lte: new Date(windows[windows.length - 1].end) },
    },
    select: { createdAt: true, totalAmount: true },
  });

  const paidByDay = new Map<string, number>();
  for (const order of paidOrders) {
    const at = order.createdAt.getTime();
    const owner = windows.find((w) => at >= w.start && at <= w.end);
    if (!owner) continue;
    paidByDay.set(owner.businessDate, (paidByDay.get(owner.businessDate) ?? 0) + order.totalAmount);
  }

  const days: DayReconciliationRow[] = closed.map((row) => {
    const paidRevenueMinor = paidByDay.get(row.businessDate) ?? 0;
    const deltaMinor = row.totalSalesMinor - paidRevenueMinor;
    return {
      businessDate: row.businessDate,
      closedSalesMinor: row.totalSalesMinor,
      paidRevenueMinor,
      deltaMinor,
      deltaPercent:
        paidRevenueMinor !== 0 ? Math.round((deltaMinor / paidRevenueMinor) * 1000) / 10 : null,
      flagged: Math.abs(deltaMinor) >= RECONCILIATION_THRESHOLD_MINOR,
      closedByName: row.closedBy?.name ?? null,
      closedAt: row.closedAt,
    };
  });

  return {
    days,
    closedDayCount: days.length,
    flaggedCount: days.filter((d) => d.flagged).length,
    totals: days.reduce(
      (acc, d) => ({
        closedSalesMinor: acc.closedSalesMinor + d.closedSalesMinor,
        paidRevenueMinor: acc.paidRevenueMinor + d.paidRevenueMinor,
        deltaMinor: acc.deltaMinor + d.deltaMinor,
      }),
      { closedSalesMinor: 0, paidRevenueMinor: 0, deltaMinor: 0 },
    ),
    thresholdMinor: RECONCILIATION_THRESHOLD_MINOR,
  };
}

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
