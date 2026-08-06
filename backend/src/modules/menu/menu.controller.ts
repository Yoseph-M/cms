import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { prisma } from '../../services/prisma.service';
import { emitToLiveOrders } from '../../services/socket.service';
import { recordAudit } from '../../services/audit.service';
import { getCached, setCache, invalidateCachePrefix } from '../../services/cache.service';
import { Role } from '@prisma/client';

const MENU_CACHE_TTL_MS = 60_000;

function menuCacheKey(category?: string, isAvailable?: string) {
  return `menu:${category ?? 'all'}:${isAvailable ?? 'all'}`;
}

function invalidateMenuCache() {
  invalidateCachePrefix('menu:');
}

export async function getMenuItems(req: AuthenticatedRequest, res: Response) {
  const { category, isAvailable } = req.query;
  const callerRole = req.user!.role as Role;

  const cacheKey = menuCacheKey(category as string | undefined, isAvailable as string | undefined);
  const cached = getCached<unknown[]>(cacheKey);
  if (cached) {
    res.setHeader('Cache-Control', 'private, max-age=60');
    return res.json(cached);
  }

  const whereClause: Record<string, unknown> = {};
  if (category) whereClause.category = category;

  if (isAvailable !== undefined) {
    whereClause.isAvailable = isAvailable === 'true';
  } else if (callerRole !== Role.OWNER && callerRole !== Role.MANAGER) {
    whereClause.isAvailable = true;
  }

  const items = await prisma.menuItem.findMany({
    where: whereClause,
    orderBy: { name: 'asc' },
  });

  setCache(cacheKey, items, MENU_CACHE_TTL_MS);
  res.setHeader('Cache-Control', 'private, max-age=60');
  return res.json(items);
}

export async function createMenuItem(req: AuthenticatedRequest, res: Response) {
  const { name, category, price, isAvailable } = req.body;
  const actorId = req.user!.userId;

  const newItem = await prisma.menuItem.create({
    data: {
      name,
      category,
      price: parseFloat(price),
      isAvailable: isAvailable !== undefined ? isAvailable : true,
    },
  });

  invalidateMenuCache();

  await recordAudit({
    actorId,
    actionType: 'MENU_ITEM_CREATED',
    targetType: 'MenuItem',
    targetId: newItem.id,
    details: { name: newItem.name, category: newItem.category, price: newItem.price },
  });

  return res.status(201).json(newItem);
}

export async function updateMenuItem(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const actorId = req.user!.userId;

  const before = await prisma.menuItem.findUnique({ where: { id } });
  if (!before) {
    return res.status(404).json({ error: 'Menu item not found.' });
  }

  const updatedItem = await prisma.menuItem.update({
    where: { id },
    data: req.body,
  });

  invalidateMenuCache();

  await recordAudit({
    actorId,
    actionType: 'MENU_ITEM_UPDATED',
    targetType: 'MenuItem',
    targetId: id,
    details: { before, after: updatedItem },
  });

  return res.json(updatedItem);
}

export async function toggleAvailability(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const { isAvailable } = req.body;
  const actorId = req.user!.userId;

  const existing = await prisma.menuItem.findUnique({ where: { id } });
  if (!existing) {
    return res.status(404).json({ error: 'Menu item not found.' });
  }

  const updatedItem = await prisma.menuItem.update({
    where: { id },
    data: { isAvailable },
  });

  invalidateMenuCache();

  emitToLiveOrders('menu:availabilityChanged', {
    id: updatedItem.id,
    name: updatedItem.name,
    isAvailable: updatedItem.isAvailable,
  });

  await recordAudit({
    actorId,
    actionType: 'MENU_AVAILABILITY_CHANGED',
    targetType: 'MenuItem',
    targetId: id,
    details: { name: updatedItem.name, isAvailable: updatedItem.isAvailable },
  });

  return res.json(updatedItem);
}

export async function deleteMenuItem(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const actorId = req.user!.userId;

  const item = await prisma.menuItem.findUnique({ where: { id } });
  if (!item) {
    return res.status(404).json({ error: 'Menu item not found.' });
  }

  await prisma.menuItem.delete({ where: { id } });

  invalidateMenuCache();

  await recordAudit({
    actorId,
    actionType: 'MENU_ITEM_DELETED',
    targetType: 'MenuItem',
    targetId: id,
    details: { name: item.name },
  });

  return res.json({ message: 'Menu item deleted.' });
}
