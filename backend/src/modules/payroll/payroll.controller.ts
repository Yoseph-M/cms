import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { prisma } from '../../services/prisma.service';

export async function getPayrollHistory(req: AuthenticatedRequest, res: Response) {
  const { periodMonth, periodYear, userId } = req.query;

  const whereClause: any = {};
  if (periodMonth) whereClause.periodMonth = parseInt(periodMonth as string, 10);
  if (periodYear) whereClause.periodYear = parseInt(periodYear as string, 10);
  if (userId) whereClause.userId = userId as string;

  const payments = await prisma.userPayment.findMany({
    where: whereClause,
    include: {
      user: { select: { id: true, name: true, role: true, salaryAmount: true } },
      processedBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return res.json(payments);
}

export async function previewPayroll(req: AuthenticatedRequest, res: Response) {
  const { userId, month, year } = req.params;
  const pMonth = parseInt(month, 10);
  const pYear = parseInt(year, 10);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  // Check if already paid for this period
  const existingPayment = await prisma.userPayment.findUnique({
    where: {
      userId_periodMonth_periodYear: {
        userId,
        periodMonth: pMonth,
        periodYear: pYear,
      },
    },
  });

  // Calculate attendance multiplier for the month
  const startDate = `${pYear}-${String(pMonth).padStart(2, '0')}-01`;
  const endDate = `${pYear}-${String(pMonth).padStart(2, '0')}-31`;

  const attendanceRecords = await prisma.attendance.findMany({
    where: {
      userId,
      date: { gte: startDate, lte: endDate },
    },
  });

  let presentDays = 0;
  let halfDays = 0;
  let absentDays = 0;

  for (const record of attendanceRecords) {
    if (record.status === 'PRESENT' || record.status === 'HOLIDAY' || record.status === 'LEAVE') presentDays++;
    else if (record.status === 'HALF_DAY') halfDays++;
    else if (record.status === 'ABSENT') absentDays++;
  }

  const effectiveDays = presentDays + halfDays * 0.5;
  const totalDays = 30; // standard month basis
  const proRatedSalary = Math.round(((user.salaryAmount * Math.min(effectiveDays, totalDays)) / totalDays) * 100) / 100;

  return res.json({
    user: { id: user.id, name: user.name, role: user.role, baseSalary: user.salaryAmount },
    periodMonth: pMonth,
    periodYear: pYear,
    alreadyPaid: !!existingPayment,
    existingPayment,
    attendanceSummary: { presentDays, halfDays, absentDays, totalLogged: attendanceRecords.length },
    computedPayout: proRatedSalary > 0 ? proRatedSalary : user.salaryAmount,
  });
}

export async function runPayroll(req: AuthenticatedRequest, res: Response) {
  const { periodMonth, periodYear, userIds } = req.body;
  const processedById = req.user!.userId;

  // Fetch users to include
  const usersToPay = await prisma.user.findMany({
    where: userIds && userIds.length > 0 ? { id: { in: userIds }, isActive: true } : { isActive: true },
  });

  const createdPayments = [];
  const errors = [];

  for (const user of usersToPay) {
    try {
      const payment = await prisma.userPayment.create({
        data: {
          userId: user.id,
          periodMonth,
          periodYear,
          baseSalary: user.salaryAmount,
          paidAmount: user.salaryAmount, // Standard payout
          processedById,
        },
        include: {
          user: { select: { id: true, name: true, role: true } },
        },
      });
      createdPayments.push(payment);
    } catch (err: any) {
      // Catch duplicate compound index [userId, periodMonth, periodYear]
      errors.push({
        userId: user.id,
        userName: user.name,
        error: `Payroll for ${user.name} for period ${periodMonth}/${periodYear} has already been processed and paid.`,
      });
    }
  }

  if (createdPayments.length === 0 && errors.length > 0) {
    return res.status(400).json({
      error: 'Payroll execution failed.',
      details: errors,
    });
  }

  return res.status(201).json({
    message: `Payroll run completed for ${createdPayments.length} staff member(s).`,
    processedCount: createdPayments.length,
    payments: createdPayments,
    skippedOrErrors: errors,
  });
}

export async function createAdjustment(req: AuthenticatedRequest, res: Response) {
  const { originalPaymentId, reason, adjustmentAmount } = req.body;
  const processedById = req.user!.userId;

  if (!originalPaymentId || !reason || adjustmentAmount === undefined) {
    return res.status(400).json({ error: 'originalPaymentId, reason, and adjustmentAmount are required.' });
  }

  // Ensure original payment exists
  const payment = await prisma.userPayment.findUnique({
    where: { id: originalPaymentId },
  });

  if (!payment) {
    return res.status(404).json({ error: 'Original payment not found.' });
  }

  const adjustment = await (prisma as any).payrollAdjustment.create({
    data: {
      originalPaymentId,
      reason,
      adjustmentAmount: parseFloat(adjustmentAmount),
      processedById,
    },
    include: {
      processedBy: { select: { id: true, name: true, role: true } },
    }
  });

  return res.status(201).json(adjustment);
}
