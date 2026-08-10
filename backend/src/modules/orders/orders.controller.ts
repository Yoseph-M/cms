import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { prisma } from '../../services/prisma.service';
import { emitToLiveOrders } from '../../services/socket.service';
import { triggerKitchenPrint } from '../../services/printer.service';
import { OrderStatus, PaymentMethod, Role } from '@prisma/client';
import { canTransition } from '../../utils/orderStateMachine';

export async function createOrder(req: AuthenticatedRequest, res: Response) {
  const callerRole = req.user!.role as Role;

  if (callerRole === Role.CASHIER) {
    const setting = await prisma.systemSetting.findUnique({ where: { key: 'cashierOrderingEnabled' } });
    if (setting?.value !== 'true') {
      return res.status(403).json({
        error: 'Cashier order creation is currently disabled. Ask a Manager or Owner to enable it in Settings.',
      });
    }
  }

  const waiterId = req.user!.userId;
  const waiterName = req.user!.name;
  const { clientOrderId, tableNumber, items } = req.body;

  // Server-side totalAmount calculation (NEVER trust client total)
  const computedTotal = items.reduce((sum: number, item: any) => sum + item.unitPrice * item.quantity, 0);

  const includeWaiter = { waiter: { select: { id: true, name: true } } } as const;

  // Idempotent create: return existing order on retry (Background Sync)
  const existing = await prisma.order.findUnique({
    where: { clientOrderId },
    include: includeWaiter,
  });
  if (existing) {
    return res.status(200).json({ isNew: false, order: existing });
  }

  let order;
  try {
    order = await prisma.order.create({
      data: {
        clientOrderId,
        tableNumber,
        waiterId,
        items: items.map((i: any) => ({
          menuItemId: i.menuItemId,
          name: i.name,
          unitPrice: i.unitPrice,
          quantity: i.quantity,
          notes: i.notes || '',
        })),
        totalAmount: computedTotal,
        status: OrderStatus.SUBMITTED,
      },
      include: includeWaiter,
    });
  } catch (err: any) {
    // Concurrent duplicate clientOrderId — return the winner
    if (err?.code === 'P2002') {
      const raced = await prisma.order.findUnique({
        where: { clientOrderId },
        include: includeWaiter,
      });
      if (raced) {
        return res.status(200).json({ isNew: false, order: raced });
      }
    }
    throw err;
  }

  // Trigger server-side kitchen thermal print over TCP
  triggerKitchenPrint({
    id: order.id,
    clientOrderId: order.clientOrderId,
    tableNumber: order.tableNumber,
    waiterName: order.waiter?.name || waiterName,
    createdAt: order.createdAt,
    items: order.items,
  });

  // Broadcast live event to Socket.io orders room
  emitToLiveOrders('order:new', order);

  return res.status(201).json({
    isNew: true,
    order,
  });
}

export async function getOrders(req: AuthenticatedRequest, res: Response) {
  const { status, waiterId, date } = req.query;
  const callerRole = req.user!.role as Role;
  const callerId = req.user!.userId;

  const whereClause: any = {};

  // Waiter can only see their own orders unless Owner/Manager/Cashier
  if (callerRole === Role.WAITER) {
    whereClause.waiterId = callerId;
  } else if (waiterId) {
    whereClause.waiterId = waiterId as string;
  }

  if (status) {
    whereClause.status = status as OrderStatus;
  }

  if (date) {
    const start = new Date(`${date}T00:00:00.000Z`);
    const end = new Date(`${date}T23:59:59.999Z`);
    whereClause.createdAt = { gte: start, lte: end };
  }

  const orders = await prisma.order.findMany({
    where: whereClause,
    include: {
      waiter: { select: { id: true, name: true } },
      cashier: { select: { id: true, name: true } },
      cancelledBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return res.json(orders);
}

export async function getOrderById(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      waiter: { select: { id: true, name: true } },
      cashier: { select: { id: true, name: true } },
      cancelledBy: { select: { id: true, name: true } },
    },
  });

  if (!order) {
    return res.status(404).json({ error: 'Order not found.' });
  }

  return res.json(order);
}

export async function updateOrderStatus(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const { status } = req.body;
  const targetStatus = status as OrderStatus;

  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) {
    return res.status(404).json({ error: 'Order not found.' });
  }

  if (!canTransition(order.status, targetStatus)) {
    console.warn(`[Audit] Illegal transition attempt from ${order.status} to ${targetStatus} for order ${id} by user ${req.user!.userId}`);
    return res.status(409).json({ error: `Illegal state transition from ${order.status} to ${targetStatus}` });
  }

  const result = await prisma.order.updateMany({
    where: { id, status: order.status },
    data: { status: targetStatus },
  });

  if (result.count === 0) {
    return res.status(409).json({ error: 'Concurrent update detected. Please try again.' });
  }

  const updated = await prisma.order.findUnique({
    where: { id },
    include: {
      waiter: { select: { id: true, name: true } },
      cashier: { select: { id: true, name: true } },
      cancelledBy: { select: { id: true, name: true } },
    },
  });

  emitToLiveOrders('order:updated', updated);

  return res.json(updated);
}

export async function payOrder(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const { paymentMethod } = req.body;
  const cashierId = req.user!.userId;

  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) {
    return res.status(404).json({ error: 'Order not found.' });
  }

  if (order.status === OrderStatus.PAID || order.isPaid) {
    return res.status(200).json(order);
  }

  if (!canTransition(order.status, OrderStatus.PAID)) {
    console.warn(`[Audit] Illegal transition attempt to PAID from ${order.status} for order ${id} by user ${req.user!.userId}`);
    return res.status(409).json({ error: `Illegal state transition from ${order.status} to PAID` });
  }

  const result = await prisma.order.updateMany({
    where: { id, status: order.status },
    data: {
      status: OrderStatus.PAID,
      isPaid: true,
      paymentMethod: paymentMethod as PaymentMethod,
      cashierId,
      paidAt: new Date(),
    },
  });

  if (result.count === 0) {
    return res.status(409).json({ error: 'Concurrent update detected. Please try again.' });
  }

  const updated = await prisma.order.findUnique({
    where: { id },
    include: {
      waiter: { select: { id: true, name: true } },
      cashier: { select: { id: true, name: true } },
      cancelledBy: { select: { id: true, name: true } },
    },
  });

  emitToLiveOrders('order:updated', updated);

  return res.json(updated);
}

export async function requestCancelOrder(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const { reason } = req.body;

  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) {
    return res.status(404).json({ error: 'Order not found.' });
  }

  if (order.isPaid) {
    return res.status(400).json({ error: 'Paid orders cannot be cancelled.' });
  }

  // Record cancellation reason and set pending cancel note or status
  const updated = await prisma.order.update({
    where: { id },
    data: {
      cancellationReason: reason,
    },
  });

  emitToLiveOrders('order:updated', updated);

  return res.json({ message: 'Cancellation request logged.', order: updated });
}

export async function confirmCancelOrder(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const { reason } = req.body;
  const cancelledById = req.user!.userId;

  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) {
    return res.status(404).json({ error: 'Order not found.' });
  }

  if (!canTransition(order.status, OrderStatus.CANCELLED)) {
    console.warn(`[Audit] Illegal transition attempt to CANCELLED from ${order.status} for order ${id} by user ${req.user!.userId}`);
    return res.status(409).json({ error: `Illegal state transition from ${order.status} to CANCELLED` });
  }

  const result = await prisma.order.updateMany({
    where: { id, status: order.status },
    data: {
      status: OrderStatus.CANCELLED,
      cancellationReason: reason || order.cancellationReason || 'Cancelled by staff',
      cancelledById,
    },
  });

  if (result.count === 0) {
    return res.status(409).json({ error: 'Concurrent update detected. Please try again.' });
  }

  const updated = await prisma.order.findUnique({
    where: { id },
    include: {
      waiter: { select: { id: true, name: true } },
      cashier: { select: { id: true, name: true } },
      cancelledBy: { select: { id: true, name: true } },
    },
  });

  emitToLiveOrders('order:cancelled', updated);

  return res.json(updated);
}

export async function getReceipt(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      waiter: { select: { id: true, name: true } },
      cashier: { select: { id: true, name: true } },
    },
  });

  if (!order) {
    return res.status(404).json({ error: 'Order not found.' });
  }

  const receiptData = {
    businessName: 'Enterprise POS Restaurant',
    receiptHeader: 'Thank you for dining with us!',
    orderId: order.id,
    clientOrderId: order.clientOrderId,
    tableNumber: order.tableNumber,
    waiter: order.waiter?.name || 'N/A',
    cashier: order.cashier?.name || 'N/A',
    createdAt: order.createdAt,
    paidAt: order.paidAt,
    paymentMethod: order.paymentMethod,
    items: order.items,
    totalAmount: order.totalAmount,
    status: order.status,
    isPaid: order.isPaid,
  };

  return res.json(receiptData);
}

export async function reprintOrder(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      waiter: { select: { id: true, name: true } },
    },
  });

  if (!order) {
    return res.status(404).json({ error: 'Order not found.' });
  }

  triggerKitchenPrint({
    id: order.id,
    clientOrderId: order.clientOrderId,
    tableNumber: order.tableNumber,
    waiterName: order.waiter?.name || 'Staff',
    createdAt: order.createdAt,
    items: order.items,
  });

  return res.json({ message: 'Reprint triggered successfully.' });
}
