import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { recordSettlement, getOrderSettlements, getSettlementById, getRemainingAmount } from '../../services/settlement.service';
import { prisma } from '../../services/prisma.service';
import { logger } from '../../utils/logger';
import { OrderStatus, Prisma } from '@prisma/client';

/** Order fields the settlement page needs for its detail card. */
const ORDER_SUMMARY_SELECT = Prisma.validator<Prisma.OrderSelect>()({
  id: true,
  clientOrderId: true,
  tableNumber: true,
  totalAmount: true,
  status: true,
  createdAt: true,
  cancellationReason: true,
  items: true, // embedded OrderItem composite: name, quantity, unitPrice, notes
  waiter: { select: { id: true, name: true, role: true } },
});

interface SettlementRow {
  id: string;
  orderId: string;
  amountMinor: number;
  method: string;
  reference: string;
  note: string;
  createdAt: Date;
  order: {
    id: string;
    clientOrderId: string;
    tableNumber: string;
    totalAmount: number;
    status: string;
    createdAt: Date;
  } | null;
  recordedBy: { id: string; name: string; role: string } | null;
  /**
   * True for rows synthesised from a cancelled order that has no settlement
   * document of its own. The row is an audit entry, not a stored payment.
   */
  isSyntheticVoid?: boolean;
}

/**
 * GET /api/settlements
 * Get all settlements (global history), paginated.
 * Accessible by all authenticated roles.
 *
 * Supported filters (all optional):
 *   - from, to: ISO timestamps that bound the settlement.createdAt range.
 *   - method: CASH | CARD | MOBILE
 *   - table: matches the related order's tableNumber (case-insensitive contains).
 *   - order: matches the related order's id or clientOrderId (contains).
 *   - minAmount, maxAmount: bounds on amountMinor.
 *   - recordedBy: matches the related order's waiter id or name (contains).
 */
export async function getAllSettlements(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
    const skip = (page - 1) * limit;

    const method = req.query.method as string | undefined;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    const table = (req.query.table as string | undefined)?.trim();
    const order = (req.query.order as string | undefined)?.trim();
    const recordedBy = (req.query.recordedBy as string | undefined)?.trim();
    const minAmount = req.query.minAmount as string | undefined;
    const maxAmount = req.query.maxAmount as string | undefined;

    const where: Record<string, unknown> = {};
    // NONE marks VOID settlements — the audit rows written when an order is
    // cancelled (directly, via approval, or auto-cancelled by the scheduler).
    if (method && ['CASH', 'CARD', 'MOBILE', 'NONE'].includes(method)) {
      where.method = method;
    }
    if (from || to) {
      const range: Record<string, Date> = {};
      if (from) range.gte = new Date(from);
      if (to) {
        const toDate = new Date(to);
        // Treat the upper bound as the end of that day for "Date" filters.
        toDate.setHours(23, 59, 59, 999);
        range.lte = toDate;
      }
      where.createdAt = range;
    }
    let amountRange: Record<string, number> | undefined;
    if (minAmount || maxAmount) {
      const amount: Record<string, number> = {};
      if (minAmount) amount.gte = parseInt(minAmount, 10);
      if (maxAmount) amount.lte = parseInt(maxAmount, 10);
      amountRange = amount;
      where.amountMinor = amount;
    }

    // The table/order filters cannot be expressed in the settlement query (the
    // related order is fetched separately), so they are applied to the merged
    // rows below via `matchesOrderFilters`.
    //
    // Resolved user ids for the `recordedBy` filter — needed for both stored
    // settlements and the synthesised void rows below.
    let recordedByUserIds: string[] | null = null;
    if (recordedBy) {
      // Only match `id` when the input looks like a Mongo ObjectId. Passing free
      // text to Prisma's ObjectId `id` filter throws "Malformed ObjectID", which
      // turns this endpoint into a 500 the moment a user types a waiter name.
      const idMatch = /^[0-9a-fA-F]{24}$/.test(recordedBy) ? [{ id: recordedBy }] : [];
      const users = await prisma.user.findMany({
        where: {
          OR: [
            { name: { contains: recordedBy, mode: 'insensitive' } },
            ...idMatch,
          ],
        },
        select: { id: true },
      });
      if (users.length === 0) {
        // No matching user — short-circuit with an empty page so the UI doesn't load stale data.
        return res.json({
          data: [],
          pagination: { page, limit, total: 0, totalPages: 0 },
        });
      }
      recordedByUserIds = users.map((u) => u.id);
      where.order = { waiterId: { in: recordedByUserIds } };
    }

    // Every matching settlement is loaded before the page is sliced, because
    // synthesised void rows have to be interleaved with the stored ones.
    const settlements = await prisma.settlement.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    // Resolve the related order & recorder with separate queries instead of
    // `include`. A settlement can outlive its order (e.g. the order was hard
    // deleted), and on MongoDB Prisma throws "Field order is required to return
    // data, got `null` instead" for such orphaned rows — which 500s the entire
    // settlement history. The frontend already renders a missing order as "—",
    // so surface orphans instead of crashing on them.
    const orderIds = [...new Set(settlements.map((s) => s.orderId))];
    const recorderIds = [...new Set(settlements.map((s) => s.recordedById))];
    const [orders, recorders] = await Promise.all([
      prisma.order.findMany({
        where: { id: { in: orderIds } },
        select: ORDER_SUMMARY_SELECT,
      }),
      prisma.user.findMany({
        where: { id: { in: recorderIds } },
        select: { id: true, name: true, role: true },
      }),
    ]);
    const orderById = new Map(orders.map((o) => [o.id, o]));
    const recorderById = new Map(recorders.map((u) => [u.id, u]));
    const hydrated = settlements.map((s) => ({
      ...s,
      order: orderById.get(s.orderId) ?? null,
      recordedBy: recorderById.get(s.recordedById) ?? null,
    }));

    /**
     * Shared predicate for the table/order filters. It used to run only over
     * stored settlements; now both kinds of row go through the same test.
     */
    const matchesOrderFilters = (relatedOrder: SettlementRow['order']): boolean => {
      if (!table && !order) return true;
      if (!relatedOrder) return false;
      if (table && !(relatedOrder.tableNumber || '').toLowerCase().includes(table.toLowerCase())) {
        return false;
      }
      if (order) {
        const idMatch = relatedOrder.id === order;
        const clientMatch = (relatedOrder.clientOrderId || '').toLowerCase().includes(order.toLowerCase());
        if (!idMatch && !clientMatch) return false;
      }
      return true;
    };

    const filtered: SettlementRow[] = hydrated.filter((s) => matchesOrderFilters(s.order));

    /**
     * Cancelled tickets must show on this page, but their VOID audit row is only
     * written at cancellation time — anything cancelled before that behaviour
     * existed (or through a path where the write failed) has no settlement row
     * at all and would silently disappear from the history. Synthesise a VOID
     * row from the order itself so every cancellation is listed; rows already
     * carrying a settlement of their own are skipped to avoid duplicates.
     */
    let voidRows: SettlementRow[] = [];
    if (!method || method === 'NONE') {
      const voidWhere: Record<string, unknown> = {
        status: OrderStatus.CANCELLED,
        settlements: { none: {} },
      };
      // The void is dated from the order, so it is filtered and shown on the
      // order's own timestamp (no cancellation timestamp is stored).
      if (where.createdAt) voidWhere.createdAt = where.createdAt;
      if (amountRange) voidWhere.totalAmount = amountRange;
      if (recordedByUserIds) voidWhere.waiterId = { in: recordedByUserIds };

      const orphanedCancellations = await prisma.order.findMany({
        where: voidWhere,
        select: ORDER_SUMMARY_SELECT,
      });

      voidRows = orphanedCancellations
        .filter((relatedOrder) => matchesOrderFilters(relatedOrder))
        .map((relatedOrder) => ({
          id: `void-${relatedOrder.id}`,
          orderId: relatedOrder.id,
          amountMinor: Math.max(relatedOrder.totalAmount, 0),
          method: 'NONE',
          reference: 'VOID',
          note: relatedOrder.cancellationReason
            ? `Cancelled: ${relatedOrder.cancellationReason}`
            : 'Cancelled',
          createdAt: relatedOrder.createdAt,
          order: relatedOrder,
          recordedBy: null,
          isSyntheticVoid: true,
        }));
    }

    const merged = [...filtered, ...voidRows].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    const total = merged.length;

    return res.json({
      data: merged.slice(skip, skip + limit),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    logger.error({ error }, 'Failed to fetch global settlement history');
    return next(error);
  }
}
/**
 * POST /api/orders/:orderId/settlements
 * Record an external settlement for an order
 */
export async function createSettlement(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const { orderId } = req.params;
  const { amountMinor, method, reference, note } = req.body;
  const recordedById = req.user!.userId;
  
  // Extract idempotency key from header
  const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

  try {
    const result = await recordSettlement({
      orderId,
      amountMinor,
      method,
      reference,
      note,
      recordedById,
      idempotencyKey,
      // Detects the same key being reused with different payment parameters.
      requestFingerprint: `${orderId}:${amountMinor}:${method}`,
    });

    // A genuine new settlement is 201; an idempotent replay of a settled
    // request returns the same payload as 200 so clients treat it as a read.
    return res.status(result.isReplay ? 200 : 201).json({
      settlement: result.settlement,
      order: result.order,
    });
  } catch (error: any) {
    logger.error({ error, orderId, recordedById }, 'Settlement recording failed');
    
    // Pass error to global error middleware for proper handling
    return next(error);
  }
}

/**
 * GET /api/orders/:orderId/settlements
 * Get all settlements for an order
 */
export async function listSettlements(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const { orderId } = req.params;

  try {
    const settlements = await getOrderSettlements(orderId);
    return res.json(settlements);
  } catch (error: any) {
    logger.error({ error, orderId }, 'Failed to fetch settlements');
    return next(error);
  }
}

/**
 * GET /api/settlements/:settlementId
 * Get a specific settlement by ID
 */
export async function getSettlement(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const { settlementId } = req.params;

  try {
    const settlement = await getSettlementById(settlementId);
    
    if (!settlement) {
      return res.status(404).json({ error: 'Settlement not found' });
    }

    return res.json(settlement);
  } catch (error: any) {
    logger.error({ error, settlementId }, 'Failed to fetch settlement');
    return next(error);
  }
}

/**
 * GET /api/orders/:orderId/remaining-amount
 * Get remaining amount to settle for an order
 */
export async function getRemaining(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const { orderId } = req.params;

  try {
    const remaining = await getRemainingAmount(orderId);
    return res.json({ orderId, remainingAmount: remaining });
  } catch (error: any) {
    logger.error({ error, orderId }, 'Failed to calculate remaining amount');
    return next(error);
  }
}
