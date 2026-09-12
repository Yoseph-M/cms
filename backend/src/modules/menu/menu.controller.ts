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
    return res.json(cached);
  }

  const whereClause: Record<string, unknown> = {};
  if (category) whereClause.category = category;

  if (isAvailable !== undefined) {
    whereClause.isAvailable = isAvailable === 'true';
  } else if (callerRole !== Role.OWNER && callerRole !== Role.MANAGER && callerRole !== Role.CASHIER) {
    whereClause.isAvailable = true;
  }

  const items = await prisma.menuItem.findMany({
    where: whereClause,
    orderBy: { name: 'asc' },
  });

  setCache(cacheKey, items, MENU_CACHE_TTL_MS);
  // No browser HTTP caching: with max-age in place the browser kept serving a
  // pre-toggle snapshot for up to 60s, and our post-toggle reconcile refetch
  // received stale data that visually reverted availability switches.
  return res.json(items);
}

/**
 * Create a new menu item.
 * 
 * @param price - Price in ETB as entered. E.g., 15.99 for 15.99 ETB
 */
export async function createMenuItem(req: AuthenticatedRequest, res: Response) {
  const { name, nameAmharic, category, price, isAvailable, imageUrl } = req.body;
  const actorId = req.user!.userId;

  const newItem = await prisma.menuItem.create({
    data: {
      name,
      nameAmharic: nameAmharic ?? null,
      category,
      price, // Already in ETB from frontend
      isAvailable: isAvailable !== undefined ? isAvailable : true,
      imageUrl,
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

/**
 * Update an existing menu item.
 * 
 * @param price - Price in ETB as entered if provided. E.g., 15.99 for 15.99 ETB
 */
export async function updateMenuItem(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const actorId = req.user!.userId;

  const before = await prisma.menuItem.findUnique({ where: { id } });
  if (!before) {
    return res.status(404).json({ error: 'Menu item not found.' });
  }

  const updatedItem = await prisma.menuItem.update({
    where: { id },
    data: {
      name: req.body.name,
      // Send null explicitly to clear the Amharic name (validated schema only
      // forwards defined keys, so an absent key leaves the stored value alone).
      ...(req.body.nameAmharic !== undefined ? { nameAmharic: req.body.nameAmharic } : {}),
      category: req.body.category,
      price: req.body.price, // Already in ETB from frontend
      isAvailable: req.body.isAvailable,
      imageUrl: req.body.imageUrl,
    },
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

  // Single conditional write — no pre-read, no transaction, no retry loop.
  // This is what makes toggling feel instant even on a busy database.
  const result = await prisma.menuItem.updateMany({
    where: { id },
    data: { isAvailable },
  });

  if (result.count === 0) {
    return res.status(404).json({ error: 'Menu item not found.' });
  }

  invalidateMenuCache();

  emitToLiveOrders('menu:availabilityChanged', { id, isAvailable });

  // Fire-and-forget: audit persistence must never block the toggle response.
  void recordAudit({
    actorId,
    actionType: 'MENU_AVAILABILITY_CHANGED',
    targetType: 'MenuItem',
    targetId: id,
    details: { isAvailable },
  });

  return res.json({ id, isAvailable });
}

/**
 * Bulk availability update for select-mode (Mark Available / Mark Unavailable).
 * One conditional write for the whole set instead of N round-trips.
 */
export async function bulkToggleAvailability(req: AuthenticatedRequest, res: Response) {
  const { ids, isAvailable } = req.body;
  const actorId = req.user!.userId;

  const result = await prisma.menuItem.updateMany({
    where: { id: { in: ids } },
    data: { isAvailable },
  });

  invalidateMenuCache();

  for (const id of ids) {
    emitToLiveOrders('menu:availabilityChanged', { id, isAvailable });
  }

  void recordAudit({
    actorId,
    actionType: 'MENU_AVAILABILITY_CHANGED',
    targetType: 'MenuItem',
    targetId: ids.join(','),
    details: { ids, isAvailable, count: result.count },
  });

  return res.json({ updated: result.count, ids, isAvailable });
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
