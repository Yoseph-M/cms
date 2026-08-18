import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { prisma } from '../../services/prisma.service';
import { emitToLiveOrders } from '../../services/socket.service';
import { enqueueKitchenPrintJob, processTCPPrintJob } from '../../services/printer.service';
import { OrderStatus, PaymentMethod, Role, PrintTransport } from '@prisma/client';
import { executeInTransaction } from '../../utils/transaction';
import { canTransition } from '../../utils/orderStateMachine';
import { recordAudit } from '../../services/audit.service';
import { getBusinessDayStart, getBusinessDayEnd, parseBusinessDate } from '../../utils/businessTime';

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

  // Server-side pricing: NEVER trust the client for unitPrice or totalAmount
  const requestedItemIds = items.map((i: any) => i.menuItemId);
  const menuItems = await prisma.menuItem.findMany({
    where: { id: { in: requestedItemIds } },
  });

  const menuItemMap = new Map(menuItems.map(m => [m.id, m]));
  let computedTotal = 0;
  
  const validatedItems: Array<{ menuItemId: string; name: string; unitPrice: number; quantity: number; notes: string }> = [];
  for (const item of items) {
    const dbItem = menuItemMap.get(item.menuItemId);
    if (!dbItem) {
      return res.status(400).json({ error: `Menu item not found: ${item.menuItemId}` });
    }
    if (!dbItem.isAvailable) {
      return res.status(400).json({ error: `Menu item unavailable: ${dbItem.name}` });
    }
    if (typeof item.quantity !== 'number' || item.quantity <= 0) {
      return res.status(400).json({ error: `Invalid quantity for item: ${dbItem.name}` });
    }

    const unitPrice = dbItem.price; // Already minor units in DB
    computedTotal += unitPrice * item.quantity;
    
    validatedItems.push({
      menuItemId: dbItem.id,
      name: dbItem.name,
      unitPrice,
      quantity: item.quantity,
      notes: item.notes || '',
    });
  }

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
  let createdPrintJobId: string | null = null;
  let printTransport: PrintTransport | null = null;
  
  try {
    order = await executeInTransaction(prisma, async (tx) => {
      const newOrder = await tx.order.create({
        data: {
          clientOrderId,
          tableNumber,
          waiterId,
          items: validatedItems,
          totalAmount: computedTotal,
          status: OrderStatus.SUBMITTED,
        },
        include: includeWaiter,
      });

      const printJob = await enqueueKitchenPrintJob(tx, {
        id: newOrder.id,
        clientOrderId: newOrder.clientOrderId,
        tableNumber: newOrder.tableNumber,
        waiterName: newOrder.waiter?.name || waiterName,
        createdAt: newOrder.createdAt,
        items: newOrder.items as any,
      });

      if (printJob) {
        createdPrintJobId = printJob.id;
        printTransport = printJob.transport;
      }

      return newOrder;
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

  // Trigger server-side kitchen thermal print over TCP if legacy
  if (createdPrintJobId && printTransport === PrintTransport.TCP) {
    processTCPPrintJob(createdPrintJobId).catch(e => console.error(e));
  } else if (createdPrintJobId && printTransport === PrintTransport.WINDOWS) {
    emitToLiveOrders('printJob:queued', { printJobId: createdPrintJobId, station: 'kitchen' });
  }

  // Broadcast live event to Socket.io orders room
  emitToLiveOrders('order:new', order as any);

  return res.status(201).json({
    isNew: true,
    order,
  });
}

export async function getOrders(req: AuthenticatedRequest, res: Response) {
  const { status, waiterId, date, page, limit } = req.query;
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
    // Use centralized business timezone
    const start = getBusinessDayStart(parseBusinessDate(date as string));
    const end = getBusinessDayEnd(parseBusinessDate(date as string));
    whereClause.createdAt = { gte: start, lte: end };
  }

  const pageNum = Math.max(1, parseInt(page as string) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(limit as string) || 50));
  const skip = (pageNum - 1) * pageSize;

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where: whereClause,
      include: {
        waiter: { select: { id: true, name: true } },
        cashier: { select: { id: true, name: true } },
        cancelledBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.order.count({ where: whereClause })
  ]);

  return res.json({
    data: orders,
    pagination: {
      page: pageNum,
      limit: pageSize,
      total,
      totalPages: Math.ceil(total / pageSize)
    }
  });
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

  emitToLiveOrders('order:updated', updated as any);

  return res.json(updated);
}

/**
 * @deprecated Use POST /api/orders/:orderId/settlements instead
 * This endpoint is kept for backward compatibility but will be removed in a future version.
 * 
 * PATCH /api/orders/:id/pay
 * Legacy payment endpoint - marks order as paid
 */
export async function payOrder(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const { paymentMethod } = req.body;
  const cashierId = req.user!.userId;

  // Add deprecation warning header
  res.setHeader('X-Deprecated', 'true');
  res.setHeader('X-Deprecated-Replacement', 'POST /api/orders/:orderId/settlements');

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
    where: { id, status: order.status, isPaid: false },
    data: {
      status: OrderStatus.PAID,
      isPaid: true,
      paymentMethod: paymentMethod as PaymentMethod,
      cashierId,
      paidAt: new Date(),
      settlementStatus: 'SETTLED', // Update new field for consistency
    },
  });

  if (result.count === 0) {
    return res.status(409).json({ error: 'Concurrent update detected or already paid. Please try again.' });
  }

  const updated = await prisma.order.findUnique({
    where: { id },
    include: {
      waiter: { select: { id: true, name: true } },
      cashier: { select: { id: true, name: true } },
      cancelledBy: { select: { id: true, name: true } },
    },
  });

  await recordAudit({
    actorId: cashierId,
    actionType: 'ORDER_PAID',
    targetType: 'Order',
    targetId: id,
    details: { paymentMethod, totalAmount: updated?.totalAmount, note: 'Legacy payment endpoint used' },
  });

  emitToLiveOrders('order:updated', updated as any);

  return res.json(updated);
}

/**
 * @deprecated Use POST /api/orders/:orderId/cancellation-request instead
 * This endpoint is kept for backward compatibility but will be removed in a future version.
 * The new workflow requires formal request/approval flow for better control and audit trail.
 * 
 * POST /api/orders/:id/cancel-request
 * Legacy cancellation request endpoint
 */
export async function requestCancelOrder(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const { reason } = req.body;

  // Add deprecation warning header
  res.setHeader('X-Deprecated', 'true');
  res.setHeader('X-Deprecated-Replacement', 'POST /api/orders/:orderId/cancellation-request');

  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) {
    return res.status(404).json({ error: 'Order not found.' });
  }

  const callerRole = req.user!.role;

  if (order.isPaid && callerRole !== Role.MANAGER && callerRole !== Role.OWNER) {
    return res.status(403).json({ error: 'Only Managers or Owners can request cancellation for paid orders.' });
  }

  // Record cancellation reason and set pending cancel note or status
  const updated = await prisma.order.update({
    where: { id },
    data: {
      cancellationReason: reason,
    },
  });

  await recordAudit({
    actorId: req.user!.userId,
    actionType: 'ORDER_CANCEL_REQUESTED_LEGACY',
    targetType: 'Order',
    targetId: id,
    details: { reason, note: 'Legacy cancel request endpoint used' },
  });

  emitToLiveOrders('order:updated', updated as any);

  return res.json({ message: 'Cancellation request logged.', order: updated });
}

/**
 * @deprecated Use PATCH /api/cancellation-requests/:requestId/approve instead
 * This endpoint is kept for backward compatibility but will be removed in a future version.
 * The new workflow provides proper request/approval tracking with audit trail.
 * 
 * PATCH /api/orders/:id/cancel-confirm
 * Legacy cancellation confirmation endpoint
 */
export async function confirmCancelOrder(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const { reason } = req.body;
  const cancelledById = req.user!.userId;

  // Add deprecation warning header
  res.setHeader('X-Deprecated', 'true');
  res.setHeader('X-Deprecated-Replacement', 'PATCH /api/cancellation-requests/:requestId/approve');

  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) {
    return res.status(404).json({ error: 'Order not found.' });
  }

  // Prevent cancellation of settled orders (Phase 3 integration)
  if (order.settlementStatus !== 'UNSETTLED') {
    return res.status(400).json({ 
      error: 'Cannot cancel orders that have been settled or partially settled. Please use the new cancellation request workflow.' 
    });
  }

  if (!canTransition(order.status, OrderStatus.CANCELLED)) {
    console.warn(`[Audit] Illegal transition attempt to CANCELLED from ${order.status} for order ${id} by user ${req.user!.userId}`);
    return res.status(409).json({ error: `Illegal state transition from ${order.status} to CANCELLED` });
  }

  const callerRole = req.user!.role;
  if (order.isPaid && callerRole !== Role.MANAGER && callerRole !== Role.OWNER) {
    return res.status(403).json({ error: 'Only Managers or Owners can confirm cancellation for paid orders.' });
  }

  const result = await prisma.order.updateMany({
    where: { id, status: order.status },
    data: {
      status: OrderStatus.CANCELLED,
      isPaid: false, // Ensure revenue is properly reversed
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

  await recordAudit({
    actorId: cancelledById,
    actionType: 'ORDER_CANCELLED',
    targetType: 'Order',
    targetId: id,
    details: { reason: reason || order.cancellationReason || 'Cancelled by staff', wasPaid: order.isPaid, note: 'Legacy cancel confirm endpoint used' },
  });

  emitToLiveOrders('order:cancelled', updated as any);

  return res.json(updated);
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

  const printJob = await enqueueKitchenPrintJob(prisma, {
    id: order.id,
    clientOrderId: order.clientOrderId,
    tableNumber: order.tableNumber,
    waiterName: order.waiter?.name || 'Staff',
    createdAt: order.createdAt,
    items: order.items as any,
  });

  if (printJob?.transport === PrintTransport.TCP) {
    processTCPPrintJob(printJob.id).catch(e => console.error(e));
  } else if (printJob?.transport === PrintTransport.WINDOWS) {
    emitToLiveOrders('printJob:queued', { printJobId: printJob.id, station: 'kitchen' });
  }

  return res.json({ message: 'Reprint triggered successfully.' });
}
