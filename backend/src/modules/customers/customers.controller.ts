import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { prisma } from '../../services/prisma.service';
import { recordAudit } from '../../services/audit.service';

export async function listCustomers(req: AuthenticatedRequest, res: Response) {
  const search = (req.query.search as string | undefined)?.trim();
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const where = search ? {
    OR: [
      { name: { contains: search, mode: 'insensitive' as const } },
      { phone: { contains: search } },
      { email: { contains: search, mode: 'insensitive' as const } },
    ],
  } : {};
  const [data, total] = await Promise.all([
    prisma.customer.findMany({ where, orderBy: { name: 'asc' }, skip: (page - 1) * limit, take: limit }),
    prisma.customer.count({ where }),
  ]);
  return res.json({ data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
}

export async function getCustomer(req: AuthenticatedRequest, res: Response) {
  const customer = await prisma.customer.findUnique({
    where: { id: req.params.id },
    include: {
      orders: {
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: {
          id: true, tableNumber: true, status: true, totalAmount: true, createdAt: true,
          items: true,
          settlements: { select: { amountMinor: true, method: true, createdAt: true } },
        },
      },
    },
  });
  if (!customer) return res.status(404).json({ error: 'Customer not found.' });
  return res.json(customer);
}

export async function createCustomer(req: AuthenticatedRequest, res: Response) {
  const customer = await prisma.customer.create({ data: req.body });
  void recordAudit({ actorId: req.user!.userId, actionType: 'CUSTOMER_CREATED', targetType: 'Customer', targetId: customer.id, details: { name: customer.name } });
  return res.status(201).json(customer);
}

export async function updateCustomer(req: AuthenticatedRequest, res: Response) {
  const current = await prisma.customer.findUnique({ where: { id: req.params.id } });
  if (!current) return res.status(404).json({ error: 'Customer not found.' });
  const customer = await prisma.customer.update({ where: { id: req.params.id }, data: req.body });
  void recordAudit({ actorId: req.user!.userId, actionType: 'CUSTOMER_UPDATED', targetType: 'Customer', targetId: customer.id, details: { before: current, after: customer } });
  return res.json(customer);
}

export async function deleteCustomer(req: AuthenticatedRequest, res: Response) {
  const customer = await prisma.customer.findUnique({ where: { id: req.params.id } });
  if (!customer) return res.status(404).json({ error: 'Customer not found.' });
  const orderCount = await prisma.order.count({ where: { customerId: customer.id } });
  if (orderCount > 0) return res.status(409).json({ error: 'Customers with sales history cannot be deleted. Edit or archive the profile instead.' });
  await prisma.customer.delete({ where: { id: req.params.id } });
  void recordAudit({ actorId: req.user!.userId, actionType: 'CUSTOMER_DELETED', targetType: 'Customer', targetId: customer.id, details: { name: customer.name } });
  return res.json({ message: 'Customer deleted.' });
}
