/**
 * Backfill: payroll payments → expenses ledger
 *
 * Payroll is now mirrored into the expenses ledger automatically, so the
 * Expenses page (and the Finance expense totals) include payroll without anyone
 * re-entering it. This script brings *historical* payments in line: every
 * UserPayment without a matching PAYROLL expense gets one.
 *
 * The mirror description is deterministic (`Payroll — <name> (<Mon YYYY>)`) and
 * a payment is unique per staff member and period, so that description acts as
 * the natural key: re-running the script is a no-op. Each new expense is also
 * audited, so the trail shows which rows this backfill wrote.
 *
 * Back up your database before running it.
 *
 * Usage:
 *   cd backend
 *   npm run backfill:payroll-expenses
 */

import { PrismaClient, ExpenseCategory } from '@prisma/client';

const prisma = new PrismaClient();

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

async function alreadyMirrored(description: string): Promise<boolean> {
  const existing = await prisma.expense.findFirst({
    where: { category: ExpenseCategory.PAYROLL, description },
    select: { id: true },
  });
  return Boolean(existing);
}

async function main() {
  const payments = await prisma.userPayment.findMany({
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`Checking ${payments.length} payroll payment(s)…`);

  let created = 0;
  let skipped = 0;

  for (const payment of payments) {
    const periodLabel = `${MONTH_LABELS[payment.periodMonth - 1] ?? payment.periodMonth} ${payment.periodYear}`;
    const description = `Payroll — ${payment.user?.name ?? 'Staff'} (${periodLabel})`;

    if (await alreadyMirrored(description)) {
      skipped += 1;
      continue;
    }

    const expense = await prisma.expense.create({
      data: {
        category: ExpenseCategory.PAYROLL,
        amount: payment.paidAmount,
        description,
        date: payment.createdAt,
        recordedById: payment.processedById,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: payment.processedById,
        actionType: 'EXPENSE_CREATED',
        targetType: 'Expense',
        targetId: expense.id,
        details: {
          source: 'PAYROLL_BACKFILL',
          paymentId: payment.id,
          userId: payment.userId,
          amount: payment.paidAmount,
          periodMonth: payment.periodMonth,
          periodYear: payment.periodYear,
        },
      },
    });

    created += 1;
  }

  console.log(`Done. Created ${created} expense(s); ${skipped} already mirrored.`);
}

main()
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
