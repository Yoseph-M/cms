import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { prisma } from '../../services/prisma.service';
import { OrderStatus } from '@prisma/client';

function pctDelta(current: number, prior: number): number | null {
  if (prior === 0) return current > 0 ? 100 : null;
  return Math.round(((current - prior) / prior) * 1000) / 10;
}

function mongoDate(d: Date) {
  return { $date: d.toISOString() };
}

function dateRangeMatch(field: string, from?: string, to?: string) {
  if (!from && !to) return {};
  const range: Record<string, unknown> = {};
  // Accept the boundary timestamps exactly as provided by the frontend.
  // The frontend sends full ISO strings (e.g. 2024-08-11T00:00:00.000+03:00 / ...T23:59:59.999+03:00)
  // so that the query is always anchored to the *user's* local day, not the server's UTC midnight.
  if (from) range.$gte = mongoDate(new Date(from));
  if (to) range.$lte = mongoDate(new Date(to));
  return { [field]: range };
}

async function aggregateSales(
  start: Date,
  end: Date
): Promise<{ totalRevenue: number; orderCount: number }> {
  const pipeline = [
    {
      $match: {
        status: 'PAID',
        createdAt: { $gte: mongoDate(start), $lte: mongoDate(end) },
      },
    },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: '$totalAmount' },
        orderCount: { $sum: 1 },
      },
    },
  ];

  const raw = (await prisma.order.aggregateRaw({ pipeline: pipeline as never })) as unknown as Array<{
    totalRevenue?: number;
    orderCount?: number;
  }>;

  const row = raw[0];
  return {
    totalRevenue: row?.totalRevenue ?? 0,
    orderCount: row?.orderCount ?? 0,
  };
}

export async function getDailySales(req: AuthenticatedRequest, res: Response) {
  const offsetHours = 3; // East Africa Time
  const now = new Date();
  now.setUTCHours(now.getUTCHours() + offsetHours);
  
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();

  const todayStart = new Date(Date.UTC(y, m, d, -offsetHours, 0, 0, 0));
  const todayEnd = new Date(Date.UTC(y, m, d, 23 - offsetHours, 59, 59, 999));

  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setUTCDate(yesterdayStart.getUTCDate() - 1);
  const yesterdayEnd = new Date(todayEnd);
  yesterdayEnd.setUTCDate(yesterdayEnd.getUTCDate() - 1);

  const mtdStart = new Date(Date.UTC(y, m, 1, -offsetHours, 0, 0, 0));
  const priorMtdStart = new Date(Date.UTC(y, m - 1, 1, -offsetHours, 0, 0, 0));
  const priorMtdEnd = new Date(Date.UTC(y, m, 0, 23 - offsetHours, 59, 59, 999));

  const [today, yesterday, mtd, priorMtd] = await Promise.all([
    aggregateSales(todayStart, todayEnd),
    aggregateSales(yesterdayStart, yesterdayEnd),
    aggregateSales(mtdStart, todayEnd),
    aggregateSales(priorMtdStart, priorMtdEnd),
  ]);

  const totalRevenue = today.totalRevenue;
  const orderCount = today.orderCount;
  const avgTicket = orderCount > 0 ? Math.round(totalRevenue / orderCount) : 0; // Average in cents
  const mtdRevenue = mtd.totalRevenue;
  const priorDayRevenue = yesterday.totalRevenue;
  const priorMtdRevenue = priorMtd.totalRevenue;

  const activeOrdersCount = await prisma.order.count({
    where: {
      status: { in: [OrderStatus.SUBMITTED, OrderStatus.IN_KITCHEN, OrderStatus.SERVED] },
    },
  });

  return res.json({
    date: new Date(todayStart.getTime() + offsetHours * 3600000).toISOString().split('T')[0],
    totalRevenue,
    mtdRevenue, // Already in cents
    orderCount,
    avgTicket,
    activeOrdersCount,
    deltas: {
      revenueVsPriorDay: pctDelta(totalRevenue, priorDayRevenue),
      mtdVsPriorMonth: pctDelta(mtdRevenue, priorMtdRevenue),
      ordersVsPriorDay: pctDelta(orderCount, yesterday.orderCount),
      aovVsPriorDay: pctDelta(
        avgTicket,
        yesterday.orderCount > 0 ? priorDayRevenue / yesterday.orderCount : 0
      ),
    },
  });
}

export async function getTotalSales(req: AuthenticatedRequest, res: Response) {
  const result = await prisma.order.aggregate({
    _sum: {
      totalAmount: true,
    },
    _count: {
      id: true,
    },
    where: {
      status: 'PAID',
    },
  });

  return res.json({
    totalRevenue: result._sum.totalAmount || 0,
    orderCount: result._count.id || 0,
  });
}

export async function getMonthlySales(req: AuthenticatedRequest, res: Response) {
  const offsetHours = 3;
  const now = new Date();
  now.setUTCHours(now.getUTCHours() + offsetHours);
  const currentYear = now.getUTCFullYear();
  const yearStart = new Date(Date.UTC(currentYear, 0, 1, -offsetHours, 0, 0, 0));

  const pipeline = [
    {
      $match: {
        status: 'PAID',
        createdAt: { $gte: mongoDate(yearStart) },
      },
    },
    {
      $group: {
        _id: { $month: '$createdAt' },
        revenue: { $sum: '$totalAmount' },
        orderCount: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
    {
      $project: {
        _id: 0,
        monthNum: '$_id',
        revenue: { $round: ['$revenue', 2] },
        orderCount: 1,
      },
    },
  ];

  const raw = (await prisma.order.aggregateRaw({ pipeline: pipeline as never })) as unknown as Array<{
    monthNum: number;
    revenue: number;
    orderCount: number;
  }>;

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const byMonth = new Map(raw.map((r) => [r.monthNum, r]));

  const chartData = monthNames.map((name, i) => {
    const m = i + 1;
    const row = byMonth.get(m);
    return {
      month: name,
      revenue: row?.revenue ?? 0,
      orderCount: row?.orderCount ?? 0,
    };
  });

  return res.json(chartData);
}

export async function getTopItems(req: AuthenticatedRequest, res: Response) {
  const { from, to } = req.query;

  const match: Record<string, unknown> = { status: { $ne: 'CANCELLED' } };
  Object.assign(match, dateRangeMatch('createdAt', from as string | undefined, to as string | undefined));

  const pipeline = [
    { $match: match },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.name',
        totalQty: { $sum: '$items.quantity' },
        totalRevenue: {
          $sum: { $multiply: ['$items.unitPrice', '$items.quantity'] },
        },
      },
    },
    { $sort: { totalQty: -1 } },
    { $limit: 10 },
    {
      $project: {
        _id: 0,
        name: '$_id',
        totalQty: 1,
        totalRevenue: 1,
      },
    },
  ];

  const rawResult = await prisma.order.aggregateRaw({ pipeline: pipeline as never });
  return res.json(rawResult);
}

export async function getStaffPerformance(req: AuthenticatedRequest, res: Response) {
  const { from, to, role } = req.query;

  const match: Record<string, unknown> = { status: { $ne: 'CANCELLED' } };
  Object.assign(match, dateRangeMatch('createdAt', from as string | undefined, to as string | undefined));

  const pipeline: Record<string, unknown>[] = [
    { $match: match },
    {
      $group: {
        _id: '$waiterId',
        orderCount: { $sum: 1 },
        totalSales: { $sum: '$totalAmount' },
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'waiter',
      },
    },
    { $unwind: '$waiter' },
  ];

  if (role) {
    pipeline.push({ $match: { 'waiter.role': role } });
  }

  pipeline.push(
    { $sort: { totalSales: -1 } },
    {
      $project: {
        _id: 0,
        waiterId: { $toString: '$_id' },
        name: '$waiter.name',
        role: '$waiter.role',
        orderCount: 1,
        totalSales: 1,
      },
    }
  );

  const rawResult = await prisma.order.aggregateRaw({ pipeline: pipeline as never });
  return res.json(rawResult);
}

export async function getTrendSales(req: AuthenticatedRequest, res: Response) {
  const { startDate, endDate } = req.query;
  const start = startDate
    ? new Date(startDate as string)
    : new Date(new Date().setDate(new Date().getDate() - 7));
  const end = endDate ? new Date(endDate as string) : new Date();
  end.setHours(23, 59, 59, 999);

  const pipeline = [
    {
      $match: {
        status: 'PAID',
        createdAt: { $gte: mongoDate(start), $lte: mongoDate(end) },
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        revenue: { $sum: '$totalAmount' },
        orderCount: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
    {
      $project: {
        _id: 0,
        date: '$_id',
        revenue: { $round: ['$revenue', 2] },
        orderCount: 1,
      },
    },
  ];

  const rawResult = await prisma.order.aggregateRaw({ pipeline: pipeline as never });
  return res.json(rawResult);
}

export async function getCategorySplit(req: AuthenticatedRequest, res: Response) {
  const { from, to } = req.query;
  const match: Record<string, unknown> = { status: { $in: ['PAID', 'SERVED', 'IN_KITCHEN'] } };
  Object.assign(match, dateRangeMatch('createdAt', from as string | undefined, to as string | undefined));

  const pipeline = [
    { $match: match },
    { $unwind: '$items' },
    {
      $lookup: {
        from: 'menuitems',
        localField: 'items.menuItemId',
        foreignField: '_id',
        as: 'menuItemDetails',
      },
    },
    { $unwind: '$menuItemDetails' },
    {
      $group: {
        _id: '$menuItemDetails.category',
        revenue: { $sum: { $multiply: ['$items.unitPrice', '$items.quantity'] } },
        count: { $sum: '$items.quantity' },
      },
    },
    { $project: { _id: 0, category: '$_id', revenue: 1, count: 1 } },
  ];

  const rawResult = await prisma.order.aggregateRaw({ pipeline: pipeline as never });
  return res.json(rawResult);
}

export async function getPeakHours(req: AuthenticatedRequest, res: Response) {
  const { from, to } = req.query;
  const match: Record<string, unknown> = { status: { $ne: 'CANCELLED' } };
  Object.assign(match, dateRangeMatch('createdAt', from as string | undefined, to as string | undefined));

  const pipeline = [
    { $match: match },
    {
      $project: {
        hour: { $hour: '$createdAt' },
        dayOfWeek: { $dayOfWeek: '$createdAt' },
      },
    },
    {
      $group: {
        _id: { hour: '$hour', dayOfWeek: '$dayOfWeek' },
        count: { $sum: 1 },
      },
    },
    {
      $project: {
        _id: 0,
        hour: '$_id.hour',
        dayOfWeek: '$_id.dayOfWeek',
        count: 1,
      },
    },
  ];

  const rawResult = await prisma.order.aggregateRaw({ pipeline: pipeline as never });
  return res.json(rawResult);
}

export async function getPaymentMethods(req: AuthenticatedRequest, res: Response) {
  const { from, to } = req.query;
  // Use settlementStatus instead of deprecated isPaid/paymentMethod
  const match: Record<string, unknown> = {};
  Object.assign(match, dateRangeMatch('createdAt', from as string | undefined, to as string | undefined));

  const pipeline = [
    { $match: match },
    {
      $group: {
        _id: '$method',
        revenue: { $sum: '$amountMinor' },
        count: { $sum: 1 },
      },
    },
    { $project: { _id: 0, method: '$_id', revenue: 1, count: 1 } },
  ];

  const rawResult = await prisma.settlement.aggregateRaw({ pipeline: pipeline as never });
  return res.json(rawResult);
}
export async function getCancellations(req: AuthenticatedRequest, res: Response) {
  const { from, to } = req.query;
  const match: Record<string, unknown> = { status: 'CANCELLED' };
  Object.assign(match, dateRangeMatch('updatedAt', from as string | undefined, to as string | undefined));

  const pipeline = [
    { $match: match },
    {
      $group: {
        _id: '$cancellationReason',
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1 } },
    { $project: { _id: 0, reason: '$_id', count: 1 } },
  ];

  const rawResult = await prisma.order.aggregateRaw({ pipeline: pipeline as never });
  return res.json(rawResult);
}

export async function getAuditLogs(req: AuthenticatedRequest, res: Response) {
  const { actorId, actionType, dateFrom, dateTo, cursor } = req.query;
  const take = 50;

  const where: Record<string, unknown> = {};
  if (actorId) where.actorId = actorId;
  if (actionType) where.actionType = actionType;

  if (dateFrom || dateTo) {
    where.timestamp = {};
    if (dateFrom) (where.timestamp as Record<string, Date>).gte = new Date(dateFrom as string);
    if (dateTo) (where.timestamp as Record<string, Date>).lte = new Date(dateTo as string);
  }

  // MongoDB permits legacy audit rows to outlive their actor account. Do not
  // let one orphaned actor relation make the whole audit feed unavailable.
  const rawAuditLogs = await prisma.auditLog.findMany({
    where,
    take: take + 1,
    skip: cursor ? 1 : 0,
    cursor: cursor ? { id: cursor as string } : undefined,
    orderBy: { timestamp: 'desc' },
  });
  const actorIds = [...new Set(rawAuditLogs.map((log) => log.actorId))];
  const actors = actorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, name: true, role: true },
      })
    : [];
  const actorsById = new Map(actors.map((actor) => [actor.id, actor]));
  const auditLogs = rawAuditLogs.flatMap((log) => {
    const actor = actorsById.get(log.actorId);
    return actor ? [{ ...log, actor }] : [];
  });

  let nextCursor = null;
  if (auditLogs.length > take) {
    const nextItem = auditLogs.pop();
    nextCursor = nextItem?.id ?? null;
  }

  return res.json({ logs: auditLogs, nextCursor });
}

export async function getLoginHistory(req: AuthenticatedRequest, res: Response) {
  const { userId, outcome, dateFrom, dateTo, cursor } = req.query;
  const take = 50;

  const where: Record<string, unknown> = {};
  if (userId) where.userId = userId;
  if (outcome) where.outcome = outcome;

  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) (where.createdAt as Record<string, Date>).gte = new Date(dateFrom as string);
    if (dateTo) (where.createdAt as Record<string, Date>).lte = new Date(dateTo as string);
  }

  const logs = await prisma.loginHistory.findMany({
    where,
    take: take + 1,
    skip: cursor ? 1 : 0,
    cursor: cursor ? { id: cursor as string } : undefined,
    include: {
      user: {
        select: { id: true, name: true, role: true, username: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  let nextCursor = null;
  if (logs.length > take) {
    const nextItem = logs.pop();
    nextCursor = nextItem?.id ?? null;
  }

  return res.json({ logs, nextCursor });
}

/**
 * GET /analytics/profit-loss?from&to
 * Revenue (paid non-cancelled orders) vs payroll + other expenses → net.
 */
/**
 * GET /analytics/profit-loss?from&to
 * Revenue (settled non-cancelled orders) vs payroll + other expenses → net.
 */
export async function getProfitLoss(req: AuthenticatedRequest, res: Response) {
  const from = (req.query.from as string) || undefined;
  const to = (req.query.to as string) || undefined;

  const orderMatch: Record<string, unknown> = {
    settlementStatus: 'SETTLED',
    status: { $ne: 'CANCELLED' },
  };
  Object.assign(orderMatch, dateRangeMatch('createdAt', from, to));

  const orderPipeline = [
    { $match: orderMatch },
    { $group: { _id: null, revenue: { $sum: '$totalAmount' } } },
  ];

  const paymentMatch = dateRangeMatch('paymentDate', from, to);

  const paymentPipeline = [
    { $match: paymentMatch },
    {
      $lookup: {
        from: 'payroll_adjustments',
        localField: '_id',
        foreignField: 'originalPaymentId',
        as: 'adjustments',
      },
    },
    {
      $project: {
        total: {
          $add: ['$paidAmount', { $sum: '$adjustments.adjustmentAmount' }],
        },
      },
    },
    { $group: { _id: null, payrollCost: { $sum: '$total' } } },
  ];

  const expenseMatch: Record<string, unknown> = {
    category: { $ne: 'PAYROLL' },
  };
  Object.assign(expenseMatch, dateRangeMatch('date', from, to));

  const expensePipeline = [
    { $match: expenseMatch },
    { $group: { _id: null, otherExpenses: { $sum: '$amount' } } },
  ];

  const [ordersRaw, paymentsRaw, expensesRaw] = (await Promise.all([
    prisma.order.aggregateRaw({ pipeline: orderPipeline as never }),
    prisma.userPayment.aggregateRaw({ pipeline: paymentPipeline as never }),
    prisma.expense.aggregateRaw({ pipeline: expensePipeline as never }),
  ])) as unknown as [
    Array<{ revenue: number }>,
    Array<{ payrollCost: number }>,
    Array<{ otherExpenses: number }>
  ];

  const revenue = ordersRaw[0]?.revenue ?? 0;
  const payrollCost = paymentsRaw[0]?.payrollCost ?? 0;
  const otherExpenses = expensesRaw[0]?.otherExpenses ?? 0;
  const netProfit = revenue - payrollCost - otherExpenses;

  return res.json({
    from: from || null,
    to: to || null,
    revenue, // Already in cents
    payrollCost, // Already in cents
    otherExpenses, // Already in cents
    netProfit, // Already in cents
  });
}
