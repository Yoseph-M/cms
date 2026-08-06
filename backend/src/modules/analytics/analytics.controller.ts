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
  if (from) range.$gte = mongoDate(new Date(from as string));
  if (to) {
    const end = new Date(to as string);
    end.setHours(23, 59, 59, 999);
    range.$lte = mongoDate(end);
  }
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
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const yesterdayEnd = new Date(todayEnd);
  yesterdayEnd.setDate(yesterdayEnd.getDate() - 1);

  const mtdStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);
  const priorMtdStart = new Date(todayStart.getFullYear(), todayStart.getMonth() - 1, 1);
  const priorMtdEnd = new Date(todayStart.getFullYear(), todayStart.getMonth(), 0, 23, 59, 59, 999);

  const [today, yesterday, mtd, priorMtd] = await Promise.all([
    aggregateSales(todayStart, todayEnd),
    aggregateSales(yesterdayStart, yesterdayEnd),
    aggregateSales(mtdStart, todayEnd),
    aggregateSales(priorMtdStart, priorMtdEnd),
  ]);

  const totalRevenue = today.totalRevenue;
  const orderCount = today.orderCount;
  const avgTicket = orderCount > 0 ? Math.round((totalRevenue / orderCount) * 100) / 100 : 0;
  const mtdRevenue = mtd.totalRevenue;
  const priorDayRevenue = yesterday.totalRevenue;
  const priorMtdRevenue = priorMtd.totalRevenue;

  const activeOrdersCount = await prisma.order.count({
    where: {
      status: { in: [OrderStatus.SUBMITTED, OrderStatus.IN_KITCHEN, OrderStatus.SERVED] },
    },
  });

  return res.json({
    date: todayStart.toISOString().split('T')[0],
    totalRevenue,
    mtdRevenue: Math.round(mtdRevenue * 100) / 100,
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

export async function getMonthlySales(req: AuthenticatedRequest, res: Response) {
  const currentYear = new Date().getFullYear();
  const yearStart = new Date(`${currentYear}-01-01T00:00:00.000Z`);

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
        from: 'menu_items',
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
  const match: Record<string, unknown> = { status: 'PAID', paymentMethod: { $ne: 'NONE' } };
  Object.assign(match, dateRangeMatch('paidAt', from as string | undefined, to as string | undefined));

  const pipeline = [
    { $match: match },
    {
      $group: {
        _id: '$paymentMethod',
        revenue: { $sum: '$totalAmount' },
        count: { $sum: 1 },
      },
    },
    { $project: { _id: 0, method: '$_id', revenue: 1, count: 1 } },
  ];

  const rawResult = await prisma.order.aggregateRaw({ pipeline: pipeline as never });
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

  const auditLogs = await prisma.auditLog.findMany({
    where,
    take: take + 1,
    skip: cursor ? 1 : 0,
    cursor: cursor ? { id: cursor as string } : undefined,
    orderBy: { timestamp: 'desc' },
    include: { actor: { select: { name: true, role: true } } },
  });

  let nextCursor = null;
  if (auditLogs.length > take) {
    const nextItem = auditLogs.pop();
    nextCursor = nextItem?.id ?? null;
  }

  return res.json({ logs: auditLogs, nextCursor });
}

/**
 * GET /analytics/profit-loss?from&to
 * Revenue (paid non-cancelled orders) vs payroll + other expenses → net.
 */
export async function getProfitLoss(req: AuthenticatedRequest, res: Response) {
  const from = (req.query.from as string) || undefined;
  const to = (req.query.to as string) || undefined;

  const orderDateFilter: Record<string, Date> = {};
  const expenseDateFilter: Record<string, Date> = {};
  const paymentDateFilter: Record<string, Date> = {};

  if (from) {
    const start = new Date(`${from}T00:00:00.000Z`);
    orderDateFilter.gte = start;
    expenseDateFilter.gte = start;
    paymentDateFilter.gte = start;
  }
  if (to) {
    const end = new Date(`${to}T23:59:59.999Z`);
    orderDateFilter.lte = end;
    expenseDateFilter.lte = end;
    paymentDateFilter.lte = end;
  }

  const orderWhere: Record<string, unknown> = {
    isPaid: true,
    status: { not: OrderStatus.CANCELLED },
  };
  if (from || to) orderWhere.paidAt = orderDateFilter;

  const [orders, payments, expenses] = await Promise.all([
    prisma.order.findMany({
      where: orderWhere,
      select: { totalAmount: true },
    }),
    prisma.userPayment.findMany({
      where: from || to ? { paymentDate: paymentDateFilter } : {},
      select: { paidAmount: true, adjustments: { select: { adjustmentAmount: true } } },
    }),
    prisma.expense.findMany({
      where: {
        ...(from || to ? { date: expenseDateFilter } : {}),
        category: { not: 'PAYROLL' }, // payroll costs come from UserPayment
      },
      select: { amount: true },
    }),
  ]);

  const revenue = orders.reduce((s, o) => s + o.totalAmount, 0);
  const payrollCost = payments.reduce((s, p) => {
    const adj = p.adjustments.reduce((a, x) => a + x.adjustmentAmount, 0);
    return s + p.paidAmount + adj;
  }, 0);
  const otherExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const netProfit = revenue - payrollCost - otherExpenses;

  return res.json({
    from: from || null,
    to: to || null,
    revenue: Math.round(revenue * 100) / 100,
    payrollCost: Math.round(payrollCost * 100) / 100,
    otherExpenses: Math.round(otherExpenses * 100) / 100,
    netProfit: Math.round(netProfit * 100) / 100,
  });
}

