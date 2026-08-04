import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { prisma } from '../../services/prisma.service';
import { OrderStatus } from '@prisma/client';

export async function getDailySales(req: AuthenticatedRequest, res: Response) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const paidOrders = await prisma.order.findMany({
    where: {
      status: OrderStatus.PAID,
      createdAt: { gte: todayStart, lte: todayEnd },
    },
    select: { totalAmount: true },
  });

  const totalRevenue = paidOrders.reduce((sum, o) => sum + o.totalAmount, 0);
  const orderCount = paidOrders.length;
  const avgTicket = orderCount > 0 ? Math.round((totalRevenue / orderCount) * 100) / 100 : 0;

  const activeOrdersCount = await prisma.order.count({
    where: {
      status: { in: [OrderStatus.SUBMITTED, OrderStatus.IN_KITCHEN, OrderStatus.SERVED] },
    },
  });

  return res.json({
    date: todayStart.toISOString().split('T')[0],
    totalRevenue,
    orderCount,
    avgTicket,
    activeOrdersCount,
  });
}

export async function getMonthlySales(req: AuthenticatedRequest, res: Response) {
  const currentYear = new Date().getFullYear();
  const yearStart = new Date(`${currentYear}-01-01T00:00:00.000Z`);

  const paidOrders = await prisma.order.findMany({
    where: {
      status: OrderStatus.PAID,
      createdAt: { gte: yearStart },
    },
    select: { createdAt: true, totalAmount: true },
  });

  const monthlyMap: { [month: number]: { revenue: number; orderCount: number } } = {};
  for (let m = 1; m <= 12; m++) {
    monthlyMap[m] = { revenue: 0, orderCount: 0 };
  }

  for (const order of paidOrders) {
    const month = new Date(order.createdAt).getMonth() + 1;
    monthlyMap[month].revenue += order.totalAmount;
    monthlyMap[month].orderCount += 1;
  }

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const chartData = Object.keys(monthlyMap).map((mKey) => {
    const m = parseInt(mKey, 10);
    return {
      month: monthNames[m - 1],
      revenue: Math.round(monthlyMap[m].revenue * 100) / 100,
      orderCount: monthlyMap[m].orderCount,
    };
  });

  return res.json(chartData);
}

export async function getTopItems(req: AuthenticatedRequest, res: Response) {
  const orders = await prisma.order.findMany({
    where: { status: { not: OrderStatus.CANCELLED } },
    select: { items: true },
  });

  const itemCounts: { [name: string]: { name: string; totalQty: number; totalRevenue: number } } = {};

  for (const order of orders) {
    for (const item of order.items) {
      if (!itemCounts[item.name]) {
        itemCounts[item.name] = { name: item.name, totalQty: 0, totalRevenue: 0 };
      }
      itemCounts[item.name].totalQty += item.quantity;
      itemCounts[item.name].totalRevenue += item.unitPrice * item.quantity;
    }
  }

  const sortedTopItems = Object.values(itemCounts)
    .sort((a, b) => b.totalQty - a.totalQty)
    .slice(0, 10);

  return res.json(sortedTopItems);
}

export async function getStaffPerformance(req: AuthenticatedRequest, res: Response) {
  const orders = await prisma.order.findMany({
    where: { status: { not: OrderStatus.CANCELLED } },
    include: {
      waiter: { select: { id: true, name: true, role: true } },
    },
  });

  const staffMap: { [id: string]: { waiterId: string; name: string; role: string; orderCount: number; totalSales: number } } = {};

  for (const order of orders) {
    const wId = order.waiterId;
    if (!staffMap[wId]) {
      staffMap[wId] = {
        waiterId: wId,
        name: order.waiter?.name || 'Unknown Staff',
        role: order.waiter?.role || 'WAITER',
        orderCount: 0,
        totalSales: 0,
      };
    }
    staffMap[wId].orderCount += 1;
    staffMap[wId].totalSales += order.totalAmount;
  }

  const result = Object.values(staffMap).sort((a, b) => b.totalSales - a.totalSales);

  return res.json(result);
}

export async function getTrendSales(req: AuthenticatedRequest, res: Response) {
  const { startDate, endDate } = req.query;
  const start = startDate ? new Date(startDate as string) : new Date(new Date().setDate(new Date().getDate() - 7));
  const end = endDate ? new Date(endDate as string) : new Date();
  end.setHours(23, 59, 59, 999);

  const orders = await prisma.order.findMany({
    where: {
      status: OrderStatus.PAID,
      createdAt: { gte: start, lte: end },
    },
    select: { createdAt: true, totalAmount: true },
  });

  const dailyMap: { [date: string]: { revenue: number; orderCount: number } } = {};
  for (const order of orders) {
    const dString = order.createdAt.toISOString().split('T')[0];
    if (!dailyMap[dString]) dailyMap[dString] = { revenue: 0, orderCount: 0 };
    dailyMap[dString].revenue += order.totalAmount;
    dailyMap[dString].orderCount += 1;
  }

  const chartData = Object.keys(dailyMap).sort().map((d) => ({
    date: d,
    revenue: Math.round(dailyMap[d].revenue * 100) / 100,
    orderCount: dailyMap[d].orderCount,
  }));

  return res.json(chartData);
}

export async function getCategorySplit(req: AuthenticatedRequest, res: Response) {
  const { from, to } = req.query;
  const match: any = { status: { $in: ['PAID', 'SERVED', 'IN_KITCHEN'] } };

  if (from || to) {
    match.createdAt = {};
    if (from) match.createdAt.$gte = { $date: new Date(from as string).toISOString() };
    if (to) match.createdAt.$lte = { $date: new Date(to as string).toISOString() };
  }

  // To aggregate by category, we need to lookup menu_items or assume order.items has it.
  // Oh wait, OrderItem embedded document only has menuItemId, name, unitPrice, quantity. 
  // It does NOT have category stored. We must $lookup from menu_items.
  const pipeline = [
    { $match: match },
    { $unwind: "$items" },
    { $lookup: {
        from: "menu_items",
        localField: "items.menuItemId",
        foreignField: "_id",
        as: "menuItemDetails"
      }
    },
    { $unwind: "$menuItemDetails" },
    { $group: {
        _id: "$menuItemDetails.category",
        revenue: { $sum: { $multiply: ["$items.unitPrice", "$items.quantity"] } },
        count: { $sum: "$items.quantity" }
      }
    },
    { $project: { _id: 0, category: "$_id", revenue: 1, count: 1 } }
  ];

  const rawResult = await prisma.order.aggregateRaw({ pipeline });
  return res.json(rawResult);
}

export async function getPeakHours(req: AuthenticatedRequest, res: Response) {
  const { from, to } = req.query;
  const match: any = { status: { $ne: 'CANCELLED' } };

  if (from || to) {
    match.createdAt = {};
    if (from) match.createdAt.$gte = { $date: new Date(from as string).toISOString() };
    if (to) match.createdAt.$lte = { $date: new Date(to as string).toISOString() };
  }

  const pipeline = [
    { $match: match },
    { $project: { 
        hour: { $hour: "$createdAt" }, 
        dayOfWeek: { $dayOfWeek: "$createdAt" } 
      } 
    },
    { $group: { 
        _id: { hour: "$hour", dayOfWeek: "$dayOfWeek" }, 
        count: { $sum: 1 } 
      } 
    },
    { $project: { _id: 0, hour: "$_id.hour", dayOfWeek: "$_id.dayOfWeek", count: 1 } }
  ];

  const rawResult = await prisma.order.aggregateRaw({ pipeline });
  return res.json(rawResult);
}

export async function getPaymentMethods(req: AuthenticatedRequest, res: Response) {
  const { from, to } = req.query;
  const match: any = { status: 'PAID', paymentMethod: { $ne: 'NONE' } };

  if (from || to) {
    match.paidAt = {};
    if (from) match.paidAt.$gte = { $date: new Date(from as string).toISOString() };
    if (to) match.paidAt.$lte = { $date: new Date(to as string).toISOString() };
  }

  const pipeline = [
    { $match: match },
    { $group: {
        _id: "$paymentMethod",
        revenue: { $sum: "$totalAmount" },
        count: { $sum: 1 }
      }
    },
    { $project: { _id: 0, method: "$_id", revenue: 1, count: 1 } }
  ];

  const rawResult = await prisma.order.aggregateRaw({ pipeline });
  return res.json(rawResult);
}

export async function getCancellations(req: AuthenticatedRequest, res: Response) {
  const { from, to } = req.query;
  const match: any = { status: 'CANCELLED' };

  if (from || to) {
    match.updatedAt = {};
    if (from) match.updatedAt.$gte = { $date: new Date(from as string).toISOString() };
    if (to) match.updatedAt.$lte = { $date: new Date(to as string).toISOString() };
  }

  const pipeline = [
    { $match: match },
    { $group: {
        _id: "$cancellationReason",
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } },
    { $project: { _id: 0, reason: "$_id", count: 1 } }
  ];

  const rawResult = await prisma.order.aggregateRaw({ pipeline });
  return res.json(rawResult);
}

export async function getAuditLogs(req: AuthenticatedRequest, res: Response) {
  const { actorId, actionType, dateFrom, dateTo, cursor } = req.query;
  const take = 50;
  
  const where: any = {};
  if (actorId) where.actorId = actorId;
  if (actionType) where.actionType = actionType;
  
  if (dateFrom || dateTo) {
    where.timestamp = {};
    if (dateFrom) where.timestamp.gte = new Date(dateFrom as string);
    if (dateTo) where.timestamp.lte = new Date(dateTo as string);
  }

  // Ignore TS errors if prisma client isn't fully generated yet
  const auditLogs = await (prisma as any).auditLog.findMany({
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
    nextCursor = nextItem.id;
  }

  return res.json({ logs: auditLogs, nextCursor });
}
