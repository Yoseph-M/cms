import { Router } from 'express';
import { Role } from '@prisma/client';
import { requireAuth, type AuthenticatedRequest } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { prisma } from '../../services/prisma.service';

const router = Router();

router.use(requireAuth, requireRole([Role.OWNER, Role.MANAGER]));

/** A deliberately small, grouped global search for the command palette. */
router.get('/', async (req: AuthenticatedRequest, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (q.length < 2) return res.json({ staff: [], menuItems: [], orders: [] });

  const contains = { contains: q, mode: 'insensitive' as const };
  const [staff, menuItems, orders] = await Promise.all([
    prisma.user.findMany({
      where: { name: contains },
      select: { id: true, name: true, role: true, isActive: true },
      take: 8,
    }),
    prisma.menuItem.findMany({
      where: { name: contains },
      select: { id: true, name: true, category: true, price: true, isAvailable: true },
      take: 8,
    }),
    prisma.order.findMany({
      where: { OR: [{ tableNumber: contains }, { clientOrderId: contains }] },
      select: { id: true, clientOrderId: true, tableNumber: true, totalAmount: true, status: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 8,
    }),
  ]);

  return res.json({ staff, menuItems, orders });
});

export default router;
