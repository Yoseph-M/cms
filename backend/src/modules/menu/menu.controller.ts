import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { prisma } from '../../services/prisma.service';
import { emitToLiveOrders } from '../../services/socket.service';

export async function getMenuItems(req: AuthenticatedRequest, res: Response) {
  const { category, isAvailable } = req.query;

  const whereClause: any = {};
  if (category) whereClause.category = category;
  
  if (isAvailable !== undefined) {
    whereClause.isAvailable = isAvailable === 'true';
  } else {
    // Spec §5: soft-delete query discipline - exclude removed by default
    whereClause.isAvailable = true;
  }

  const items = await prisma.menuItem.findMany({
    where: whereClause,
    orderBy: { name: 'asc' },
  });

  return res.json(items);
}

export async function createMenuItem(req: AuthenticatedRequest, res: Response) {
  const { name, category, price, isAvailable } = req.body;

  const newItem = await prisma.menuItem.create({
    data: {
      name,
      category,
      price: parseFloat(price),
      isAvailable: isAvailable !== undefined ? isAvailable : true,
    },
  });

  return res.status(201).json(newItem);
}

export async function updateMenuItem(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;

  const updatedItem = await prisma.menuItem.update({
    where: { id },
    data: req.body,
  });

  return res.json(updatedItem);
}

export async function toggleAvailability(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const { isAvailable } = req.body;

  const updatedItem = await prisma.menuItem.update({
    where: { id },
    data: { isAvailable },
  });

  // Spec §5.3: emits menu:availabilityChanged to live orders room
  emitToLiveOrders('menu:availabilityChanged', {
    id: updatedItem.id,
    name: updatedItem.name,
    isAvailable: updatedItem.isAvailable,
  });

  return res.json(updatedItem);
}

export async function deleteMenuItem(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;

  await prisma.menuItem.delete({ where: { id } });

  return res.json({ message: 'Menu item deleted successfully.' });
}
