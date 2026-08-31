import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { prisma } from '../../services/prisma.service';
import { recordAudit } from '../../services/audit.service';
import { createNotification } from '../../services/notification.service';
import { emitToRoom } from '../../services/socket.service';
import { Role } from '@prisma/client';

const MANAGER_SCOPED_ROLES: Role[] = [Role.CASHIER, Role.WAITER, Role.COOKER, Role.BARISTA];

export async function getPayrollHistory(req: AuthenticatedRequest, res: Response) {
  const { periodMonth, periodYear, userId, scope } = req.query;

  const whereClause: Record<string, unknown> = {};
  if (periodMonth) whereClause.periodMonth = parseInt(periodMonth as string, 10);
  if (periodYear) whereClause.periodYear = parseInt(periodYear as string, 10);
  if (userId) whereClause.userId = userId as string;

  const payments = await prisma.userPayment.findMany({
    where: whereClause,
    include: {
      user: { select: { id: true, name: true, role: true, salaryAmount: true } },
      processedBy: { select: { id: true, name: true } },
      adjustments: {
        include: { processedBy: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  let result = payments;

  if (scope === 'manager' || req.user!.role === Role.MANAGER) {
    result = payments.filter((p) => MANAGER_SCOPED_ROLES.includes(p.user.role));
  }

  const ledger: Array<Record<string, unknown>> = [];
  for (const payment of result) {
    ledger.push({ ...payment, recordType: 'payment' });
    for (const adj of payment.adjustments) {
      ledger.push({
        id: adj.id,
        recordType: 'adjustment',
        originalPaymentId: payment.id,
        user: payment.user,
        periodMonth: payment.periodMonth,
        periodYear: payment.periodYear,
        baseSalary: payment.baseSalary,
        paidAmount: adj.adjustmentAmount,
        reason: adj.reason,
        note: payment.note,
        processedBy: adj.processedBy,
        createdAt: adj.createdAt,
      });
    }
  }

  return res.json(ledger);
}

/**
 * GET /payroll/staff-ref/:userId — reference salaryAmount for the record form default.
 */
export async function getStaffPayrollRef(req: AuthenticatedRequest, res: Response) {
  const { userId } = req.params;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, role: true, salaryAmount: true, isActive: true },
  });
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }
  return res.json(user);
}

/**
 * POST /payroll/entries — manually record that a payroll payment happened outside the system.
 */
export async function recordPayrollEntry(req: AuthenticatedRequest, res: Response) {
  const { userId, periodMonth, periodYear, paidAmount, note } = req.body;
  const processedById = req.user!.userId;
  const callerRole = req.user!.role as Role;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) {
    return res.status(404).json({ error: 'Staff member not found or inactive.' });
  }

  if (callerRole === Role.MANAGER && !MANAGER_SCOPED_ROLES.includes(user.role)) {
    return res.status(403).json({ error: 'Managers can only record payroll for operational staff.' });
  }

  // paidAmount is already in cents from frontend
  if (!Number.isInteger(paidAmount) || paidAmount < 0) {
    return res.status(400).json({ error: 'paidAmount must be a non-negative integer (cents).' });
  }

  const existing = await prisma.userPayment.findUnique({
    where: {
      userId_periodMonth_periodYear: { userId, periodMonth, periodYear },
    },
  });
  if (existing) {
    return res.status(409).json({
      error: 'Payroll recording failed.',
      details: [
        {
          userId: user.id,
          userName: user.name,
          error: `A payroll entry for ${user.name} for period ${periodMonth}/${periodYear} has already been recorded.`,
        },
      ],
    });
  }

  try {
    const payment = await prisma.userPayment.create({
      data: {
        userId,
        periodMonth,
        periodYear,
        baseSalary: user.salaryAmount,
        paidAmount, // Already in cents
        note: note || '',
        processedById,
      },
      include: {
        user: { select: { id: true, name: true, role: true } },
        processedBy: { select: { id: true, name: true } },
      },
    });

    await recordAudit({
      actorId: processedById,
      actionType: 'PAYROLL_RECORDED',
      targetType: 'UserPayment',
      targetId: payment.id,
      details: {
        userId: user.id,
        userName: user.name,
        periodMonth,
        periodYear,
        paidAmount: payment.paidAmount,
        note: note || '',
      },
    });

    emitToRoom('managers', 'finance:updated', {});

    return res.status(201).json(payment);
  } catch {
    return res.status(409).json({
      error: 'Payroll recording failed.',
      details: [
        {
          userId: user.id,
          userName: user.name,
          error: `A payroll entry for ${user.name} for period ${periodMonth}/${periodYear} has already been recorded.`,
        },
      ],
    });
  }
}

export async function createAdjustment(req: AuthenticatedRequest, res: Response) {
  const { originalPaymentId, reason, adjustmentAmount } = req.body;
  const processedById = req.user!.userId;

  if (!originalPaymentId || !reason || adjustmentAmount === undefined) {
    return res.status(400).json({ error: 'originalPaymentId, reason, and adjustmentAmount are required.' });
  }

  const payment = await prisma.userPayment.findUnique({
    where: { id: originalPaymentId },
  });

  if (!payment) {
    return res.status(404).json({ error: 'Original payment not found.' });
  }

  const adjustment = await prisma.payrollAdjustment.create({
    data: {
      originalPaymentId,
      reason,
      adjustmentAmount, // Already in cents
      processedById,
    },
    include: {
      processedBy: { select: { id: true, name: true, role: true } },
    },
  });

  await recordAudit({
    actorId: processedById,
    actionType: 'PAYROLL_ADJUSTMENT',
    targetType: 'PayrollAdjustment',
    targetId: adjustment.id,
    details: {
      originalPaymentId,
      adjustmentAmount: adjustment.adjustmentAmount,
      reason,
    },
  });

  await createNotification({
    type: 'SYSTEM_OVERRIDE',
    severity: 'info',
    message: `Payroll adjustment of ${adjustment.adjustmentAmount} recorded for period ${payment.periodMonth}/${payment.periodYear}: ${reason}`,
    relatedId: adjustment.id,
  });

  emitToRoom('managers', 'finance:updated', {});

  return res.status(201).json(adjustment);
}
