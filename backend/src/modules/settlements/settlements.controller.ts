import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { recordSettlement, getOrderSettlements, getSettlementById, getRemainingAmount } from '../../services/settlement.service';
import { prisma } from '../../services/prisma.service';
import { logger } from '../../utils/logger';

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
 *   - recordedBy: matches the recorder's id or name (contains).
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
    if (method && ['CASH', 'CARD', 'MOBILE'].includes(method)) {
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
    if (minAmount || maxAmount) {
      const amount: Record<string, number> = {};
      if (minAmount) amount.gte = parseInt(minAmount, 10);
      if (maxAmount) amount.lte = parseInt(maxAmount, 10);
      where.amountMinor = amount;
    }

    // Pull matching order ids when a table or order filter is provided.
    let orderFilter: Record<string, unknown> | undefined;
    if (table || order) {
      orderFilter = {};
      if (table) orderFilter.tableNumber = { contains: table, mode: 'insensitive' };
      if (order) {
        // clientOrderId is unique; fall back to a substring match on the order id when needed.
        orderFilter.OR = [
          { clientOrderId: { contains: order, mode: 'insensitive' } },
          { id: order },
        ];
      }
    }
    if (recordedBy) {
      const users = await prisma.user.findMany({
        where: {
          OR: [
            { name: { contains: recordedBy, mode: 'insensitive' } },
            { id: recordedBy },
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
      where.order = { waiterId: { in: users.map((u) => u.id) } };
    }

    const settlements = await prisma.settlement.findMany({
      where,
      include: {
        order: {
          select: { 
            id: true, clientOrderId: true, tableNumber: true, totalAmount: true, status: true,
            waiter: { select: { id: true, name: true, role: true } }
          },
        },
        recordedBy: {
          select: { id: true, name: true, role: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    });

    // Apply order-related filters as a post-filter so the page still respects pagination.
    const filtered = orderFilter
      ? settlements.filter((s) => {
          if (!s.order) return false;
          if (table && !(s.order.tableNumber || '').toLowerCase().includes(table.toLowerCase())) {
            return false;
          }
          if (order) {
            const idMatch = s.order.id === order;
            const clientMatch = (s.order.clientOrderId || '').toLowerCase().includes(order.toLowerCase());
            if (!idMatch && !clientMatch) return false;
          }
          return true;
        })
      : settlements;

    const total = await prisma.settlement.count({ where });

    return res.json({
      data: filtered,
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
    });

    return res.status(201).json({
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
