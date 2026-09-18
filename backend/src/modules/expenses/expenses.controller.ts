import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { prisma } from '../../services/prisma.service';
import { ExpenseCategory } from '@prisma/client';
import { recordAudit } from '../../services/audit.service';
import { emitToRoom } from '../../services/socket.service';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Payroll is written one row per staff member per month, which buries the
 * Expenses page in near-identical lines. Collapse those rows into a single
 * "Payroll — <Month> <Year>" entry whose amount is the month's total, so the
 * page shows one general payroll figure per month instead of every individual.
 * The aggregated rows are read-only (marked `isAggregated`).
 */
function aggregatePayroll(
  rows: Array<{
    date: Date;
    amount: number;
    recordedBy: { id: string; name: string } | null;
  }>,
) {
  const groups = new Map<string, {
    year: number;
    month: number;
    amount: number;
    count: number;
    latestDate: Date;
    recordedBy: { id: string; name: string } | null;
  }>();

  for (const row of rows) {
    const year = row.date.getFullYear();
    const month = row.date.getMonth() + 1;
    const key = `${year}-${String(month).padStart(2, '0')}`;
    const group = groups.get(key);
    if (group) {
      group.amount += row.amount;
      group.count += 1;
      if (row.date > group.latestDate) {
        group.latestDate = row.date;
        group.recordedBy = row.recordedBy;
      }
    } else {
      groups.set(key, {
        year,
        month,
        amount: row.amount,
        count: 1,
        latestDate: row.date,
        recordedBy: row.recordedBy,
      });
    }
  }

  return Array.from(groups.values()).map((group) => ({
    id: `payroll-${group.year}-${String(group.month).padStart(2, '0')}`,
    category: 'PAYROLL' as ExpenseCategory,
    amount: group.amount,
    description: `Payroll — ${MONTH_NAMES[group.month - 1]} ${group.year} (${group.count} payment${group.count === 1 ? '' : 's'})`,
    date: group.latestDate,
    recordedBy: group.recordedBy,
    isAggregated: true,
  }));
}

export async function listExpenses(req: AuthenticatedRequest, res: Response) {
  const { from, to, category } = req.query;

  let dateFilter: Record<string, Date> | undefined;
  if (from || to) {
    dateFilter = {};
    if (from) dateFilter.gte = new Date(from as string);
    if (to) {
      const end = new Date(to as string);
      end.setHours(23, 59, 59, 999);
      dateFilter.lte = end;
    }
  }

  const categoryFilter =
    category && Object.values(ExpenseCategory).includes(category as ExpenseCategory)
      ? (category as ExpenseCategory)
      : undefined;

  const includePayroll = !categoryFilter || categoryFilter === ExpenseCategory.PAYROLL;
  const includeOther = categoryFilter !== ExpenseCategory.PAYROLL;

  const [otherExpenses, payrollExpenses] = await Promise.all([
    includeOther
      ? prisma.expense.findMany({
          where: {
            ...(dateFilter ? { date: dateFilter } : {}),
            ...(categoryFilter ? { category: categoryFilter } : { category: { not: ExpenseCategory.PAYROLL } }),
          },
          include: { recordedBy: { select: { id: true, name: true } } },
          orderBy: { date: 'desc' },
        })
      : Promise.resolve([]),
    includePayroll
      ? prisma.expense.findMany({
          where: {
            category: ExpenseCategory.PAYROLL,
            ...(dateFilter ? { date: dateFilter } : {}),
          },
          include: { recordedBy: { select: { id: true, name: true } } },
          orderBy: { date: 'desc' },
        })
      : Promise.resolve([]),
  ]);

  const combined = [...aggregatePayroll(payrollExpenses), ...otherExpenses].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  return res.json(combined);
}

/**
 * Create a new expense.
 * 
 * @param amount - Amount in minor units (cents). E.g., 5000 for $50.00
 */
export async function createExpense(req: AuthenticatedRequest, res: Response) {
  const { category, amount, description, date } = req.body;
  const recordedById = req.user!.userId;

  if (!category || amount === undefined || !description || !date) {
    return res.status(400).json({ error: 'category, amount, description, and date are required.' });
  }

  // Amount is already in cents from frontend
  if (!Number.isInteger(amount) || amount < 0) {
    return res.status(400).json({ error: 'amount must be a non-negative integer (cents).' });
  }

  const expense = await prisma.expense.create({
    data: {
      category,
      amount, // Already in cents
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
    details: { category, amount, description, date },
  });

  emitToRoom('managers', 'finance:updated', {});

  return res.status(201).json(expense);
}

/**
 * Update an existing expense.
 * 
 * @param amount - Amount in minor units (cents) if provided. E.g., 5000 for $50.00
 */
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
    // Amount is already in cents from frontend
    if (!Number.isInteger(amount) || amount < 0) {
      return res.status(400).json({ error: 'amount must be a non-negative integer (cents).' });
    }
    data.amount = amount;
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

  emitToRoom('managers', 'finance:updated', {});

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

  emitToRoom('managers', 'finance:updated', {});

  return res.json({ message: 'Expense deleted.' });
}

export function listExpenseCategories(_req: AuthenticatedRequest, res: Response) {
  return res.json(Object.values(ExpenseCategory));
}
