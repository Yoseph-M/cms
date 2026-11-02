import { randomUUID } from 'crypto';
import { PurchaseOrderStatus } from '@prisma/client';
import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { prisma } from '../../services/prisma.service';
import { recordAudit } from '../../services/audit.service';
import { executeInCriticalTransaction } from '../../utils/transaction';

export async function listSuppliers(_req: AuthenticatedRequest, res: Response) {
  const suppliers = await prisma.supplier.findMany({ orderBy: [{ isActive: 'desc' }, { name: 'asc' }] });
  return res.json(suppliers);
}

export async function createSupplier(req: AuthenticatedRequest, res: Response) {
  const supplier = await prisma.supplier.create({ data: req.body });
  void recordAudit({ actorId: req.user!.userId, actionType: 'SUPPLIER_CREATED', targetType: 'Supplier', targetId: supplier.id, details: { name: supplier.name } });
  return res.status(201).json(supplier);
}

export async function updateSupplier(req: AuthenticatedRequest, res: Response) {
  const result = await prisma.supplier.updateMany({ where: { id: req.params.supplierId }, data: req.body });
  if (!result.count) return res.status(404).json({ error: 'Supplier not found.' });
  const supplier = await prisma.supplier.findUnique({ where: { id: req.params.supplierId } });
  void recordAudit({ actorId: req.user!.userId, actionType: 'SUPPLIER_UPDATED', targetType: 'Supplier', targetId: req.params.supplierId, details: { name: supplier?.name } });
  return res.json(supplier);
}

export async function listPurchaseOrders(req: AuthenticatedRequest, res: Response) {
  const status = req.query.status as PurchaseOrderStatus | undefined;
  const supplierId = req.query.supplierId as string | undefined;
  const purchaseOrders = await prisma.purchaseOrder.findMany({
    where: { ...(status ? { status } : {}), ...(supplierId ? { supplierId } : {}) },
    include: { supplier: { select: { id: true, name: true, phone: true } }, createdBy: { select: { id: true, name: true } }, receivedBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' }, take: 200,
  });
  return res.json(purchaseOrders);
}

export async function createPurchaseOrder(req: AuthenticatedRequest, res: Response) {
  const supplier = await prisma.supplier.findFirst({ where: { id: req.body.supplierId, isActive: true } });
  if (!supplier) return res.status(404).json({ error: 'Choose an active supplier.' });
  const products = await prisma.menuItem.findMany({ where: { id: { in: req.body.items.map((line: any) => line.menuItemId) }, trackInventory: true } });
  const productById = new Map(products.map((product) => [product.id, product]));
  if (productById.size !== req.body.items.length) return res.status(400).json({ error: 'Choose tracked inventory products only.' });
  const items = req.body.items.map((line: { menuItemId: string; quantityOrdered: number; unitCost: number }) => ({
    menuItemId: line.menuItemId,
    name: productById.get(line.menuItemId)!.name,
    quantityOrdered: line.quantityOrdered,
    quantityReceived: 0,
    unitCost: line.unitCost,
  }));
  const subtotal = items.reduce((sum: number, item: { quantityOrdered: number; unitCost: number }) => sum + item.quantityOrdered * item.unitCost, 0);
  const purchaseNumber = `PO-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 6).toUpperCase()}`;
  const order = await prisma.purchaseOrder.create({
    data: { purchaseNumber, supplierId: supplier.id, items, subtotal, notes: req.body.notes, createdById: req.user!.userId },
    include: { supplier: { select: { id: true, name: true, phone: true } }, createdBy: { select: { id: true, name: true } } },
  });
  void recordAudit({ actorId: req.user!.userId, actionType: 'PURCHASE_ORDER_CREATED', targetType: 'PurchaseOrder', targetId: order.id, details: { purchaseNumber, supplier: supplier.name, subtotal } });
  return res.status(201).json(order);
}

export async function receivePurchaseOrder(req: AuthenticatedRequest, res: Response) {
  const existing = await prisma.purchaseOrder.findUnique({ where: { id: req.params.purchaseOrderId } });
  if (!existing) return res.status(404).json({ error: 'Purchase order not found.' });
  if (existing.status !== PurchaseOrderStatus.OPEN && existing.status !== PurchaseOrderStatus.PARTIALLY_RECEIVED) {
    return res.status(409).json({ error: 'This purchase order is no longer accepting deliveries.' });
  }
  const receivedById = new Map(existing.items.map((item) => [item.menuItemId, item]));
  for (const line of req.body.items as Array<{ menuItemId: string; quantity: number }>) {
    const item = receivedById.get(line.menuItemId);
    if (!item || item.quantityReceived + line.quantity > item.quantityOrdered) {
      return res.status(400).json({ error: 'Received quantities cannot exceed the quantities on the purchase order.' });
    }
  }

  let result;
  try {
    result = await executeInCriticalTransaction(prisma, async (tx) => {
      const current = await tx.purchaseOrder.findUnique({ where: { id: existing.id } });
      if (!current || (current.status !== PurchaseOrderStatus.OPEN && current.status !== PurchaseOrderStatus.PARTIALLY_RECEIVED)) throw new Error('PURCHASE_ORDER_CLOSED');
      const lines = new Map(current.items.map((item) => [item.menuItemId, { ...item }]));
      const receivedAt = new Date();
      for (const line of req.body.items as Array<{ menuItemId: string; quantity: number }>) {
        const item = lines.get(line.menuItemId);
        if (!item || item.quantityReceived + line.quantity > item.quantityOrdered) throw new Error('PURCHASE_QUANTITY_EXCEEDED');
        item.quantityReceived += line.quantity;
        const product = await tx.menuItem.findUnique({ where: { id: line.menuItemId } });
        if (!product?.trackInventory) throw new Error('PURCHASE_PRODUCT_UNAVAILABLE');
        await tx.menuItem.update({ where: { id: product.id }, data: { stockQuantity: (product.stockQuantity ?? 0) + line.quantity, cost: item.unitCost } });
        await tx.stockMovement.create({
          data: { menuItemId: product.id, delta: line.quantity, reason: 'PURCHASE_RECEIVING', reference: current.purchaseNumber, performedById: req.user!.userId },
        });
      }
      const nextItems = [...lines.values()];
      const fullyReceived = nextItems.every((item) => item.quantityReceived === item.quantityOrdered);
      const updated = await tx.purchaseOrder.updateMany({
        where: { id: current.id, status: current.status, updatedAt: current.updatedAt },
        data: { items: nextItems, status: fullyReceived ? PurchaseOrderStatus.RECEIVED : PurchaseOrderStatus.PARTIALLY_RECEIVED, ...(fullyReceived ? { receivedAt, receivedById: req.user!.userId } : {}) },
      });
      if (!updated.count) throw new Error('PURCHASE_ORDER_CHANGED');
      return tx.purchaseOrder.findUnique({
        where: { id: current.id },
        include: { supplier: { select: { id: true, name: true, phone: true } }, createdBy: { select: { id: true, name: true } }, receivedBy: { select: { id: true, name: true } } },
      });
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'PURCHASE_ORDER_CLOSED' || code === 'PURCHASE_ORDER_CHANGED') return res.status(409).json({ error: 'This purchase order changed. Refresh and try again.' });
    if (code === 'PURCHASE_QUANTITY_EXCEEDED') return res.status(409).json({ error: 'Received quantities cannot exceed the quantities on the purchase order.' });
    if (code === 'PURCHASE_PRODUCT_UNAVAILABLE') return res.status(409).json({ error: 'A product is no longer tracked in inventory.' });
    throw error;
  }
  void recordAudit({ actorId: req.user!.userId, actionType: 'PURCHASE_ORDER_RECEIVED', targetType: 'PurchaseOrder', targetId: existing.id, details: { purchaseNumber: existing.purchaseNumber, items: req.body.items } });
  return res.json(result);
}

export async function cancelPurchaseOrder(req: AuthenticatedRequest, res: Response) {
  const order = await prisma.purchaseOrder.findUnique({ where: { id: req.params.purchaseOrderId } });
  if (!order) return res.status(404).json({ error: 'Purchase order not found.' });
  if (order.items.some((item) => item.quantityReceived > 0)) return res.status(409).json({ error: 'A purchase order with received stock cannot be cancelled.' });
  const changed = await prisma.purchaseOrder.updateMany({
    where: { id: order.id, status: PurchaseOrderStatus.OPEN },
    data: { status: PurchaseOrderStatus.CANCELLED },
  });
  if (!changed.count) return res.status(409).json({ error: 'Only open purchase orders can be cancelled.' });
  void recordAudit({ actorId: req.user!.userId, actionType: 'PURCHASE_ORDER_CANCELLED', targetType: 'PurchaseOrder', targetId: order.id, details: { purchaseNumber: order.purchaseNumber } });
  return res.json(await prisma.purchaseOrder.findUnique({ where: { id: order.id }, include: { supplier: { select: { id: true, name: true, phone: true } } } }));
}

