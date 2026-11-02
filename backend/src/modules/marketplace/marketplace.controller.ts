import { Response } from 'express';
import { MarketplaceOrderStatus, MarketplacePaymentStatus, Role } from '@prisma/client';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { prisma } from '../../services/prisma.service';
import { executeInCriticalTransaction } from '../../utils/transaction';

function pageArgs(req: AuthenticatedRequest) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
  return { page, limit, skip: (page - 1) * limit };
}

async function requireBusinessMember(businessId: string, userId: string) {
  return prisma.marketplaceBusinessMember.findUnique({
    where: { businessId_userId: { businessId, userId } },
    include: { business: true },
  });
}

function forbiddenOrMissing(res: Response) {
  return res.status(404).json({ error: 'Business not found or you do not have access.' });
}

function publicProduct(product: any) {
  const hasVariants = (product._count?.variants ?? product.variants?.length ?? 0) > 0;
  return {
    id: product.id,
    businessId: product.businessId,
    name: product.name,
    description: product.description,
    category: product.category,
    price: product.price,
    imageUrl: product.imageUrl,
    hasVariants,
    inStock: hasVariants
      ? (product.variants ?? []).some((variant: any) => variant.isActive && variant.stockQuantity > 0)
      : product.stockQuantity > 0,
    variants: (product.variants ?? []).map((variant: any) => ({
      id: variant.id,
      name: variant.name,
      price: variant.price,
      inStock: variant.stockQuantity > 0,
    })),
    ...(product.business ? {
      business: {
        id: product.business.id,
        name: product.business.name,
        slug: product.business.slug,
        category: product.business.category,
        address: product.business.address,
      },
    } : {}),
  };
}

export async function listBusinesses(req: AuthenticatedRequest, res: Response) {
  const { page, limit, skip } = pageArgs(req);
  const search = (req.query.search as string | undefined)?.trim();
  const category = (req.query.category as string | undefined)?.trim();
  const where = {
    isActive: true,
    ...(category ? { category: { equals: category, mode: 'insensitive' as const } } : {}),
    ...(search ? { OR: [
      { name: { contains: search, mode: 'insensitive' as const } },
      { description: { contains: search, mode: 'insensitive' as const } },
      { category: { contains: search, mode: 'insensitive' as const } },
    ] } : {}),
  };
  const [data, total] = await Promise.all([
    prisma.marketplaceBusiness.findMany({ where, orderBy: { name: 'asc' }, skip, take: limit }),
    prisma.marketplaceBusiness.count({ where }),
  ]);
  return res.json({ data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
}

export async function getBusinessBySlug(req: AuthenticatedRequest, res: Response) {
  const business = await prisma.marketplaceBusiness.findUnique({
    where: { slug: req.params.slug },
    include: {
      products: { where: { isActive: true }, include: { variants: { where: { isActive: true }, orderBy: { name: 'asc' } }, _count: { select: { variants: true } } }, orderBy: { name: 'asc' } },
      deliveryZones: { where: { isActive: true }, orderBy: { name: 'asc' } },
    },
  });
  if (!business?.isActive) return res.status(404).json({ error: 'Business not found.' });
  return res.json({
    id: business.id,
    name: business.name,
    slug: business.slug,
    category: business.category,
    description: business.description,
    address: business.address,
    phone: business.phone,
    email: business.email,
    logoUrl: business.logoUrl,
    products: business.products.map(publicProduct),
    deliveryZones: business.deliveryZones,
  });
}

export async function listProducts(req: AuthenticatedRequest, res: Response) {
  const { page, limit, skip } = pageArgs(req);
  const search = (req.query.search as string | undefined)?.trim();
  const category = (req.query.category as string | undefined)?.trim();
  const businessId = req.query.businessId as string | undefined;
  const where = {
    isActive: true,
    business: { isActive: true },
    ...(businessId ? { businessId } : {}),
    ...(category ? { category: { equals: category, mode: 'insensitive' as const } } : {}),
    ...(search ? { OR: [
      { name: { contains: search, mode: 'insensitive' as const } },
      { description: { contains: search, mode: 'insensitive' as const } },
      { business: { name: { contains: search, mode: 'insensitive' as const }, isActive: true } },
    ] } : {}),
  };
  const [data, total] = await Promise.all([
    prisma.marketplaceProduct.findMany({
      where,
      include: {
        business: { select: { id: true, name: true, slug: true, category: true, address: true } },
        variants: { where: { isActive: true }, orderBy: { name: 'asc' } },
        _count: { select: { variants: true } },
      },
      orderBy: { createdAt: 'desc' }, skip, take: limit,
    }),
    prisma.marketplaceProduct.count({ where }),
  ]);
  return res.json({ data: data.map(publicProduct), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
}

export async function createPublicOrder(req: AuthenticatedRequest, res: Response) {
  const { clientOrderId, businessId, deliveryZoneId, customerName, customerPhone, customerEmail, deliveryAddress, note, paymentMethod, items } = req.body;
  const existing = await prisma.marketplaceOrder.findUnique({ where: { clientOrderId } });
  if (existing) return res.status(200).json({ isNew: false, order: existing });
  const business = await prisma.marketplaceBusiness.findUnique({ where: { id: businessId } });
  if (!business?.isActive) return res.status(404).json({ error: 'Store is not available.' });
  if (!deliveryZoneId || !deliveryAddress) return res.status(400).json({ error: 'Choose a delivery area and enter a delivery address.' });
  const zone = await prisma.marketplaceDeliveryZone.findFirst({ where: { id: deliveryZoneId, businessId, isActive: true } });
  if (!zone) return res.status(400).json({ error: 'Delivery area is not available for this store.' });

  const orderItems = items as Array<{ productId: string; variantId?: string; quantity: number }>;
  const productIds: string[] = [...new Set<string>(orderItems.map((line) => line.productId))];
  const products = await prisma.marketplaceProduct.findMany({
    where: { id: { in: productIds }, businessId, isActive: true },
    include: { variants: { where: { isActive: true } }, _count: { select: { variants: true } } },
  });
  const productMap = new Map(products.map((product) => [product.id, product]));
  if (productMap.size !== productIds.length) return res.status(400).json({ error: 'One or more products are no longer available.' });

  const quantityByStockKey = new Map<string, number>();
  const orderLines: Array<{ productId: string; variantId?: string; name: string; variantName: string; sku: string; unitPrice: number; quantity: number }> = [];
  let subtotal = 0;
  for (const line of orderItems) {
    const product = productMap.get(line.productId)!;
    const variant = line.variantId ? product.variants.find((candidate) => candidate.id === line.variantId) : undefined;
    if (line.variantId && !variant) return res.status(400).json({ error: `The selected option for ${product.name} is unavailable.` });
    const unitPrice = variant?.price ?? product.price;
    const sku = variant?.sku || product.sku;
    const stockKey = variant ? `v:${variant.id}` : `p:${product.id}`;
    quantityByStockKey.set(stockKey, (quantityByStockKey.get(stockKey) ?? 0) + line.quantity);
    if (!variant && product._count.variants > 0) return res.status(400).json({ error: `Choose an option for ${product.name}.` });
    orderLines.push({ productId: product.id, variantId: variant?.id, name: product.name, variantName: variant?.name ?? '', sku, unitPrice, quantity: line.quantity });
    subtotal += unitPrice * line.quantity;
  }
  if (subtotal < zone.minimumOrderAmount) {
    return res.status(400).json({ error: `This delivery area requires a minimum order of ${zone.minimumOrderAmount}.` });
  }

  try {
    const order = await executeInCriticalTransaction(prisma, async (tx) => {
      for (const [key, quantity] of quantityByStockKey) {
        const [kind, stockId] = key.split(':');
        const changed = kind === 'v'
          ? await tx.marketplaceProductVariant.updateMany({ where: { id: stockId, isActive: true, stockQuantity: { gte: quantity } }, data: { stockQuantity: { decrement: quantity } } })
          : await tx.marketplaceProduct.updateMany({ where: { id: stockId, businessId, isActive: true, stockQuantity: { gte: quantity }, variants: { none: {} } }, data: { stockQuantity: { decrement: quantity } } });
        if (changed.count === 0) throw new Error('MARKETPLACE_OUT_OF_STOCK');
        const productId = kind === 'v' ? orderLines.find((line) => line.variantId === stockId)!.productId : stockId;
        await tx.marketplaceStockMovement.create({
          data: { businessId, productId, variantId: kind === 'v' ? stockId : null, delta: -quantity, reason: 'SALE', reference: clientOrderId },
        });
      }
      return tx.marketplaceOrder.create({
        data: {
          clientOrderId, businessId, deliveryZoneId, customerName, customerPhone,
          customerEmail, deliveryAddress, note, items: orderLines, subtotal,
          deliveryFee: zone.deliveryFee, totalAmount: subtotal + zone.deliveryFee,
          paymentMethod,
        },
        include: { business: { select: { name: true, phone: true } }, deliveryZone: { select: { name: true, estimatedMinutes: true } } },
      });
    });
    return res.status(201).json({ isNew: true, order });
  } catch (error) {
    if (error instanceof Error && error.message === 'MARKETPLACE_OUT_OF_STOCK') {
      return res.status(409).json({ error: 'One or more items just sold out. Refresh the store and try again.' });
    }
    throw error;
  }
}

export async function listManagedBusinesses(req: AuthenticatedRequest, res: Response) {
  const memberships = await prisma.marketplaceBusinessMember.findMany({
    where: { userId: req.user!.userId },
    include: { business: true }, orderBy: { createdAt: 'asc' },
  });
  return res.json(memberships.map((membership) => ({ ...membership.business, memberRole: membership.role })));
}

export async function createBusiness(req: AuthenticatedRequest, res: Response) {
  if (req.user!.role !== Role.OWNER) return res.status(403).json({ error: 'Only an owner can register a marketplace business.' });
  try {
    const business = await prisma.marketplaceBusiness.create({
      data: {
        ...req.body,
        members: { create: { userId: req.user!.userId, role: 'OWNER' } },
      },
    });
    return res.status(201).json(business);
  } catch (error: any) {
    if (error?.code === 'P2002') return res.status(409).json({ error: 'That store address is already in use.' });
    throw error;
  }
}

export async function updateBusiness(req: AuthenticatedRequest, res: Response) {
  const membership = await requireBusinessMember(req.params.businessId, req.user!.userId);
  if (!membership) return forbiddenOrMissing(res);
  const business = await prisma.marketplaceBusiness.update({ where: { id: membership.businessId }, data: req.body });
  return res.json(business);
}

export async function listBusinessMembers(req: AuthenticatedRequest, res: Response) {
  const membership = await requireBusinessMember(req.params.businessId, req.user!.userId);
  if (!membership) return forbiddenOrMissing(res);
  const members = await prisma.marketplaceBusinessMember.findMany({
    where: { businessId: membership.businessId },
    include: { user: { select: { id: true, name: true, username: true, role: true, isActive: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return res.json(members);
}

export async function addBusinessMember(req: AuthenticatedRequest, res: Response) {
  const membership = await requireBusinessMember(req.params.businessId, req.user!.userId);
  if (!membership) return forbiddenOrMissing(res);
  if (membership.role !== 'OWNER') return res.status(403).json({ error: 'Only a business owner can manage store access.' });
  const user = await prisma.user.findFirst({
    where: { username: { equals: req.body.username, mode: 'insensitive' }, isActive: true },
  });
  if (!user || (user.role !== Role.OWNER && user.role !== Role.MANAGER)) {
    return res.status(404).json({ error: 'Enter an active owner or manager account username.' });
  }
  try {
    return res.status(201).json(await prisma.marketplaceBusinessMember.upsert({
      where: { businessId_userId: { businessId: membership.businessId, userId: user.id } },
      update: { role: req.body.role },
      create: { businessId: membership.businessId, userId: user.id, role: req.body.role },
      include: { user: { select: { id: true, name: true, username: true, role: true } } },
    }));
  } catch (error: any) {
    if (error?.code === 'P2002') return res.status(409).json({ error: 'That team member already has access.' });
    throw error;
  }
}

export async function removeBusinessMember(req: AuthenticatedRequest, res: Response) {
  const membership = await requireBusinessMember(req.params.businessId, req.user!.userId);
  if (!membership) return forbiddenOrMissing(res);
  if (membership.role !== 'OWNER') return res.status(403).json({ error: 'Only a business owner can manage store access.' });
  if (req.params.userId === req.user!.userId) return res.status(400).json({ error: 'You cannot remove your own store access.' });
  const removed = await prisma.marketplaceBusinessMember.deleteMany({ where: { businessId: membership.businessId, userId: req.params.userId } });
  if (!removed.count) return res.status(404).json({ error: 'Team member not found.' });
  return res.json({ removed: true });
}

export async function listManagedProducts(req: AuthenticatedRequest, res: Response) {
  const membership = await requireBusinessMember(req.params.businessId, req.user!.userId);
  if (!membership) return forbiddenOrMissing(res);
  const products = await prisma.marketplaceProduct.findMany({ where: { businessId: membership.businessId }, include: { variants: { orderBy: { name: 'asc' } } }, orderBy: { name: 'asc' } });
  return res.json(products);
}

export async function createProduct(req: AuthenticatedRequest, res: Response) {
  const membership = await requireBusinessMember(req.params.businessId, req.user!.userId);
  if (!membership) return forbiddenOrMissing(res);
  const product = await prisma.marketplaceProduct.create({
    data: {
      ...req.body,
      businessId: membership.businessId,
      ...(req.body.stockQuantity > 0 ? { stockMovements: { create: { businessId: membership.businessId, delta: req.body.stockQuantity, reason: 'OPENING_BALANCE', performedById: req.user!.userId } } } : {}),
    },
  });
  return res.status(201).json(product);
}

export async function updateProduct(req: AuthenticatedRequest, res: Response) {
  const membership = await requireBusinessMember(req.params.businessId, req.user!.userId);
  if (!membership) return forbiddenOrMissing(res);
  const current = await prisma.marketplaceProduct.findFirst({
    where: { id: req.params.productId, businessId: membership.businessId },
    include: { variants: { select: { id: true } } },
  });
  if (!current) return res.status(404).json({ error: 'Product not found.' });
  const updated = await executeInCriticalTransaction(prisma, async (tx) => {
    const product = await tx.marketplaceProduct.update({ where: { id: current.id }, data: req.body });
    if (req.body.stockQuantity !== undefined && req.body.stockQuantity !== current.stockQuantity && current.variants.length === 0) {
      await tx.marketplaceStockMovement.create({
        data: { businessId: membership.businessId, productId: current.id, delta: req.body.stockQuantity - current.stockQuantity, reason: 'ADJUSTMENT', performedById: req.user!.userId },
      });
    }
    return product;
  });
  return res.json(updated);
}

export async function createProductVariant(req: AuthenticatedRequest, res: Response) {
  const membership = await requireBusinessMember(req.params.businessId, req.user!.userId);
  if (!membership) return forbiddenOrMissing(res);
  const product = await prisma.marketplaceProduct.findFirst({ where: { id: req.params.productId, businessId: membership.businessId } });
  if (!product) return res.status(404).json({ error: 'Product not found.' });
  return res.status(201).json(await prisma.marketplaceProductVariant.create({
    data: {
      ...req.body,
      productId: product.id,
      ...(req.body.stockQuantity > 0 ? { stockMovements: { create: { businessId: membership.businessId, productId: product.id, delta: req.body.stockQuantity, reason: 'OPENING_BALANCE', performedById: req.user!.userId } } } : {}),
    },
  }));
}

export async function updateProductVariant(req: AuthenticatedRequest, res: Response) {
  const membership = await requireBusinessMember(req.params.businessId, req.user!.userId);
  if (!membership) return forbiddenOrMissing(res);
  const current = await prisma.marketplaceProductVariant.findFirst({
    where: { id: req.params.variantId, productId: req.params.productId, product: { businessId: membership.businessId } },
  });
  if (!current) return res.status(404).json({ error: 'Product option not found.' });
  const updated = await executeInCriticalTransaction(prisma, async (tx) => {
    const variant = await tx.marketplaceProductVariant.update({ where: { id: current.id }, data: req.body });
    if (req.body.stockQuantity !== undefined && req.body.stockQuantity !== current.stockQuantity) {
      await tx.marketplaceStockMovement.create({
        data: { businessId: membership.businessId, productId: req.params.productId, variantId: current.id, delta: req.body.stockQuantity - current.stockQuantity, reason: 'ADJUSTMENT', performedById: req.user!.userId },
      });
    }
    return variant;
  });
  return res.json(updated);
}

export async function listManagedStockMovements(req: AuthenticatedRequest, res: Response) {
  const membership = await requireBusinessMember(req.params.businessId, req.user!.userId);
  if (!membership) return forbiddenOrMissing(res);
  return res.json(await prisma.marketplaceStockMovement.findMany({
    where: { businessId: membership.businessId },
    include: { product: { select: { name: true } }, variant: { select: { name: true } } },
    orderBy: { createdAt: 'desc' }, take: 100,
  }));
}

export async function listZones(req: AuthenticatedRequest, res: Response) {
  const membership = await requireBusinessMember(req.params.businessId, req.user!.userId);
  if (!membership) return forbiddenOrMissing(res);
  return res.json(await prisma.marketplaceDeliveryZone.findMany({ where: { businessId: membership.businessId }, orderBy: { name: 'asc' } }));
}

export async function createZone(req: AuthenticatedRequest, res: Response) {
  const membership = await requireBusinessMember(req.params.businessId, req.user!.userId);
  if (!membership) return forbiddenOrMissing(res);
  return res.status(201).json(await prisma.marketplaceDeliveryZone.create({ data: { ...req.body, businessId: membership.businessId } }));
}

export async function updateZone(req: AuthenticatedRequest, res: Response) {
  const membership = await requireBusinessMember(req.params.businessId, req.user!.userId);
  if (!membership) return forbiddenOrMissing(res);
  const changed = await prisma.marketplaceDeliveryZone.updateMany({ where: { id: req.params.zoneId, businessId: membership.businessId }, data: req.body });
  if (!changed.count) return res.status(404).json({ error: 'Delivery area not found.' });
  return res.json(await prisma.marketplaceDeliveryZone.findUnique({ where: { id: req.params.zoneId } }));
}

export async function listManagedOrders(req: AuthenticatedRequest, res: Response) {
  const membership = await requireBusinessMember(req.params.businessId, req.user!.userId);
  if (!membership) return forbiddenOrMissing(res);
  const status = req.query.status as MarketplaceOrderStatus | undefined;
  return res.json(await prisma.marketplaceOrder.findMany({
    where: { businessId: membership.businessId, ...(status ? { status } : {}) },
    include: { deliveryZone: { select: { name: true, estimatedMinutes: true } } },
    orderBy: { createdAt: 'desc' }, take: 100,
  }));
}

export async function updateManagedOrder(req: AuthenticatedRequest, res: Response) {
  const membership = await requireBusinessMember(req.params.businessId, req.user!.userId);
  if (!membership) return forbiddenOrMissing(res);
  const existing = await prisma.marketplaceOrder.findFirst({ where: { id: req.params.orderId, businessId: membership.businessId } });
  if (!existing) return res.status(404).json({ error: 'Order not found.' });
  const status = req.body.status as MarketplaceOrderStatus;
  const allowed: Record<MarketplaceOrderStatus, MarketplaceOrderStatus[]> = {
    PLACED: [MarketplaceOrderStatus.ACCEPTED, MarketplaceOrderStatus.CANCELLED],
    ACCEPTED: [MarketplaceOrderStatus.PREPARING, MarketplaceOrderStatus.CANCELLED],
    PREPARING: [MarketplaceOrderStatus.READY, MarketplaceOrderStatus.CANCELLED],
    READY: [MarketplaceOrderStatus.OUT_FOR_DELIVERY, MarketplaceOrderStatus.COMPLETED, MarketplaceOrderStatus.CANCELLED],
    OUT_FOR_DELIVERY: [MarketplaceOrderStatus.COMPLETED],
    COMPLETED: [],
    CANCELLED: [],
  };
  if (status !== existing.status && !allowed[existing.status].includes(status)) {
    return res.status(409).json({ error: `Cannot move an order from ${existing.status} to ${status}.` });
  }
  const paymentStatus = req.body.paymentStatus as MarketplacePaymentStatus | undefined;
  if (existing.status === MarketplaceOrderStatus.CANCELLED && paymentStatus === MarketplacePaymentStatus.PAID) {
    return res.status(409).json({ error: 'A cancelled order cannot be marked as paid.' });
  }
  const updated = await executeInCriticalTransaction(prisma, async (tx) => {
    const change = await tx.marketplaceOrder.updateMany({
      where: { id: existing.id, businessId: membership.businessId, status: existing.status },
      data: { status, ...(paymentStatus ? { paymentStatus } : {}) },
    });
    if (!change.count) return null;
    if (status === MarketplaceOrderStatus.CANCELLED && existing.status !== MarketplaceOrderStatus.CANCELLED) {
      const alreadyRestored = await tx.marketplaceStockMovement.findFirst({ where: { businessId: membership.businessId, reference: existing.clientOrderId, reason: 'CANCELLATION' }, select: { id: true } });
      if (!alreadyRestored) {
        const sales = await tx.marketplaceStockMovement.findMany({ where: { businessId: membership.businessId, reference: existing.clientOrderId, reason: 'SALE' } });
        for (const sale of sales) {
          const quantity = Math.abs(sale.delta);
          if (sale.variantId) {
            await tx.marketplaceProductVariant.update({ where: { id: sale.variantId }, data: { stockQuantity: { increment: quantity } } });
          } else {
            await tx.marketplaceProduct.update({ where: { id: sale.productId }, data: { stockQuantity: { increment: quantity } } });
          }
          await tx.marketplaceStockMovement.create({
            data: { businessId: membership.businessId, productId: sale.productId, variantId: sale.variantId, delta: quantity, reason: 'CANCELLATION', reference: existing.clientOrderId, performedById: req.user!.userId },
          });
        }
      }
    }
    return tx.marketplaceOrder.findUnique({
      where: { id: existing.id },
      include: { deliveryZone: { select: { name: true, estimatedMinutes: true } } },
    });
  });
  if (!updated) return res.status(409).json({ error: 'The order changed while you were updating it. Refresh and try again.' });
  return res.json(updated);
}
