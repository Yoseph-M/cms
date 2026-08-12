import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { prisma } from '../../services/prisma.service';
import { ExpenseCategory } from '@prisma/client';
import { recordAudit } from '../../services/audit.service';

export async function listExpenses(req: AuthenticatedRequest, res: Response) {
  const { from, to, category } = req.query;
  const where: Record<string, unknown> = {};

  if (from || to) {
    const dateFilter: Record<string, Date> = {};
    if (from) dateFilter.gte = new Date(from as string);
    if (to) {
      const end = new Date(to as string);
      end.setHours(23, 59, 59, 999);
      dateFilter.lte = end;
    }
    where.date = dateFilter;
  }
  if (category && Object.values(ExpenseCategory).includes(category as ExpenseCategory)) {
    where.category = category;
  }

  const expenses = await prisma.expense.findMany({
    where,
    include: { recordedBy: { select: { id: true, name: true } } },
    orderBy: { date: 'desc' },
  });

  return res.json(expenses);
}

export async function createExpense(req: AuthenticatedRequest, res: Response) {
  const { category, amount, description, date } = req.body;
  const recordedById = req.user!.userId;

  if (!category || amount === undefined || !description || !date) {
    return res.status(400).json({ error: 'category, amount, description, and date are required.' });
  }

  const parsedAmount = Math.round(parseFloat(amount) * 100);
  if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
    return res.status(400).json({ error: 'amount must be a non-negative number.' });
  }

  const expense = await prisma.expense.create({
    data: {
      category,
      amount: parsedAmount,
      description,
      date: new Date(date),
      recordedById,
    },
    include: { recordedBy: { select: { id: true, name: true } } },
  });

  await recordAudit({
    actorId: recordedById,
    actionType: 'EXPENSE_CREATED',
    targetType: 'Expense',
    targetId: expense.id,
    details: { category, amount: parsedAmount, description, date },
  });

  return res.status(201).json(expense);
}

export async function updateExpense(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const { category, amount, description, date } = req.body;
  const actorId = req.user!.userId;

  const existing = await prisma.expense.findUnique({ where: { id } });
  if (!existing) {
    return res.status(404).json({ error: 'Expense not found.' });
  }

  const data: Record<string, unknown> = {};
  if (category !== undefined) data.category = category;
  if (description !== undefined) data.description = description;
  if (date !== undefined) data.date = new Date(date);
  if (amount !== undefined) {
    const parsedAmount = Math.round(parseFloat(amount) * 100);
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      return res.status(400).json({ error: 'amount must be a non-negative number.' });
    }
    data.amount = parsedAmount;
  }

  const updated = await prisma.expense.update({
    where: { id },
    data,
    include: { recordedBy: { select: { id: true, name: true } } },
  });

  await recordAudit({
    actorId,
    actionType: 'EXPENSE_UPDATED',
    targetType: 'Expense',
    targetId: id,
    details: { before: existing, after: updated },
  });

  return res.json(updated);
}

export async function deleteExpense(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const actorId = req.user!.userId;

  const existing = await prisma.expense.findUnique({ where: { id } });
  if (!existing) {
    return res.status(404).json({ error: 'Expense not found.' });
  }

  await prisma.expense.delete({ where: { id } });

  await recordAudit({
    actorId,
    actionType: 'EXPENSE_DELETED',
    targetType: 'Expense',
    targetId: id,
    details: { category: existing.category, amount: existing.amount, description: existing.description },
  });

  return res.json({ message: 'Expense deleted.' });
}

export function listExpenseCategories(_req: AuthenticatedRequest, res: Response) {
  return res.json(Object.values(ExpenseCategory));
}
