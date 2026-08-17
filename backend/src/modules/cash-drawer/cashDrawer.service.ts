/**
 * Cash Drawer Service
 * 
 * Manages the cash drawer ledger — an immutable append-only log of all cash movements.
 * Every cash movement (settlements, payouts, adjustments) is recorded as a CashDrawerEvent.
 * 
 * IMMUTABILITY RULES:
 * - CashDrawerEvent records are APPEND-ONLY
 * - NO updates allowed after creation
 * - NO deletions allowed
 * - Corrections are made via compensating CASH_ADJUSTMENT events
 * - All events have permanent audit trail
 * 
 * CONTROLLED OPERATIONS:
 * - CASH_SETTLEMENT: Automatic via settlement service (not directly callable)
 * - CASH_PAYOUT: Cashier/Manager/Owner - documented cash removal
 * - PETTY_CASH: Manager/Owner - small operational expenses
 * - CASH_ADJUSTMENT: Owner only - corrections with mandatory reason
 * 
 * The expected cash formula:
 *   expected = opening_balance + cash_settlements - payouts - petty_cash ± adjustments
 */

import { prisma } from '../../services/prisma.service';
import { recordAudit } from '../../services/audit.service';
import { CashDrawerEventType, ShiftStatus } from '@prisma/client';
import { executeInCriticalTransaction } from '../../utils/transaction';
import {
  NotFoundError,
  ConflictError,
  ValidationError,
} from '../../utils/errors';
import { calculateExpectedCash } from '../cashier-shifts/cashierShifts.service';
import { logger } from '../../utils/logger';

// ─── Record Cash Settlement (from Settlement hook) ─────────

interface RecordCashSettlementParams {
  shiftId: string;
  amountMinor: number;
  settlementId: string;
  performedById: string;
}

/**
 * Called automatically when a CASH settlement is recorded.
 * Creates a CASH_SETTLEMENT ledger entry in the active shift.
 */
export async function recordCashSettlement(params: RecordCashSettlementParams) {
  const { shiftId, amountMinor, settlementId, performedById } = params;

  return prisma.cashDrawerEvent.create({
    data: {
      shiftId,
      type: CashDrawerEventType.CASH_SETTLEMENT,
      amountMinor,
      referenceType: 'Settlement',
      referenceId: settlementId,
      performedById,
      notes: `Cash settlement #${settlementId}`,
    },
  });
}

// ─── Record Cash Payout ────────────────────────────────────

interface RecordPayoutParams {
  shiftId: string;
  amountMinor: number;
  reason: string;
  reference?: string;
  performedById: string;
  idempotencyKey?: string;
}

/**
 * Record a cash payout (money leaving the drawer for legitimate reasons).
 * Examples: Customer refund, supplier payment, emergency advance.
 * Requires active OPEN shift.
 */
export async function recordCashPayout(params: RecordPayoutParams) {
  const { shiftId, amountMinor, reason, reference, performedById, idempotencyKey } = params;

  if (amountMinor <= 0) {
    throw new ValidationError('Payout amount must be positive', 'amountMinor');
  }

  if (!reason || reason.trim().length === 0) {
    throw new ValidationError('Reason is required for cash payouts', 'reason');
  }

  const result = await executeInCriticalTransaction(prisma, async (tx) => {
    // Check idempotency key first (inside transaction)
    if (idempotencyKey) {
      const existing = await tx.cashDrawerEvent.findFirst({
        where: { idempotencyKey },
      });
      
      if (existing) {
        logger.info(`Idempotent cash payout: returning existing event ${existing.id}`);
        return existing;
      }
    }

    // Verify shift is OPEN
    const shift = await tx.cashierShift.findUnique({ where: { id: shiftId } });
    if (!shift) {
      throw new NotFoundError('CashierShift', shiftId);
    }
    if (shift.status !== ShiftStatus.OPEN) {
      throw new ConflictError(
        `Cannot add payout to a ${shift.status} shift`,
        'SHIFT_NOT_OPEN'
      );
    }

    // Verify performer is authorized for this shift (cashier can only payout from own shift)
    // This check should be done in controller based on role

    const event = await tx.cashDrawerEvent.create({
      data: {
        shiftId,
        type: CashDrawerEventType.CASH_PAYOUT,
        amountMinor,
        performedById,
        referenceType: reference ? 'External' : undefined,
        referenceId: reference,
        notes: reason,
        idempotencyKey,
      },
    });

    return event;
  });

  // Audit
  await recordAudit({
    actorId: performedById,
    actionType: 'CASH_DRAWER_PAYOUT',
    targetType: 'CashDrawerEvent',
    targetId: result.id,
    details: { shiftId, amountMinor, reason, reference },
  });

  logger.info({ shiftId, amountMinor, performedById }, 'Cash payout recorded');

  return result;
}

// ─── Record Petty Cash ─────────────────────────────────────

interface RecordPettyCashParams {
  shiftId: string;
  amountMinor: number;
  reason: string;
  category?: string;
  performedById: string;
  idempotencyKey?: string;
}

/**
 * Record petty cash withdrawal (small operational expenses).
 * Examples: Office supplies, minor repairs, tips.
 * Typically requires manager approval.
 */
export async function recordPettyCash(params: RecordPettyCashParams) {
  const { shiftId, amountMinor, reason, category, performedById, idempotencyKey } = params;

  if (amountMinor <= 0) {
    throw new ValidationError('Petty cash amount must be positive', 'amountMinor');
  }

  if (!reason || reason.trim().length === 0) {
    throw new ValidationError('Reason is required for petty cash', 'reason');
  }

  const result = await executeInCriticalTransaction(prisma, async (tx) => {
    // Check idempotency key first (inside transaction)
    if (idempotencyKey) {
      const existing = await tx.cashDrawerEvent.findFirst({
        where: { idempotencyKey },
      });
      
      if (existing) {
        logger.info(`Idempotent petty cash: returning existing event ${existing.id}`);
        return existing;
      }
    }

    // Verify shift is OPEN
    const shift = await tx.cashierShift.findUnique({ where: { id: shiftId } });
    if (!shift) {
      throw new NotFoundError('CashierShift', shiftId);
    }
    if (shift.status !== ShiftStatus.OPEN) {
      throw new ConflictError(
        `Cannot add petty cash to a ${shift.status} shift`,
        'SHIFT_NOT_OPEN'
      );
    }

    const notes = category ? `${category}: ${reason}` : reason;

    const event = await tx.cashDrawerEvent.create({
      data: {
        shiftId,
        type: CashDrawerEventType.PETTY_CASH,
        amountMinor,
        performedById,
        notes,
        idempotencyKey,
      },
    });

    return event;
  });

  // Audit
  await recordAudit({
    actorId: performedById,
    actionType: 'CASH_DRAWER_PETTY_CASH',
    targetType: 'CashDrawerEvent',
    targetId: result.id,
    details: { shiftId, amountMinor, reason, category },
  });

  logger.info({ shiftId, amountMinor, performedById, category }, 'Petty cash recorded');

  return result;
}

// ─── Record Cash Adjustment ────────────────────────────────

interface RecordAdjustmentParams {
  shiftId: string;
  amountMinor: number; // Can be positive (add) or negative (remove)
  reason: string;
  approvedBy?: string; // For audit trail
  performedById: string;
  idempotencyKey?: string;
}

/**
 * Record a cash adjustment (correction or compensating event).
 * Examples: Count error correction, register discrepancy fix.
 * Requires owner authorization.
 * Can be positive (adding cash) or negative (removing cash).
 */
export async function recordCashAdjustment(params: RecordAdjustmentParams) {
  const { shiftId, amountMinor, reason, approvedBy, performedById, idempotencyKey } = params;

  if (amountMinor === 0) {
    throw new ValidationError('Adjustment amount cannot be zero', 'amountMinor');
  }

  if (!reason || reason.trim().length === 0) {
    throw new ValidationError('Reason is required for cash adjustments', 'reason');
  }

  const result = await executeInCriticalTransaction(prisma, async (tx) => {
    // Check idempotency key first (inside transaction)
    if (idempotencyKey) {
      const existing = await tx.cashDrawerEvent.findFirst({
        where: { idempotencyKey },
      });
      
      if (existing) {
        logger.info(`Idempotent cash adjustment: returning existing event ${existing.id}`);
        return existing;
      }
    }

    // Verify shift exists (can be OPEN or CLOSED for corrections)
    const shift = await tx.cashierShift.findUnique({ where: { id: shiftId } });
    if (!shift) {
      throw new NotFoundError('CashierShift', shiftId);
    }

    const adjustmentType = amountMinor > 0 ? 'increase' : 'decrease';
    const notes = approvedBy 
      ? `${reason} (Approved by: ${approvedBy})`
      : reason;

    const event = await tx.cashDrawerEvent.create({
      data: {
        shiftId,
        type: CashDrawerEventType.CASH_ADJUSTMENT,
        amountMinor,
        performedById,
        notes,
        idempotencyKey,
      },
    });

    return event;
  });

  // Audit
  await recordAudit({
    actorId: performedById,
    actionType: 'CASH_DRAWER_ADJUSTMENT',
    targetType: 'CashDrawerEvent',
    targetId: result.id,
    details: { shiftId, amountMinor, reason, approvedBy },
  });

  logger.warn(
    { shiftId, amountMinor, performedById, approvedBy }, 
    'Cash adjustment recorded (sensitive operation)'
  );

  return result;
}

// ─── Get Ledger for Shift ──────────────────────────────────

export async function getShiftLedger(shiftId: string) {
  const events = await prisma.cashDrawerEvent.findMany({
    where: { shiftId },
    include: {
      performedBy: { select: { id: true, name: true, role: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const expectedCash = calculateExpectedCash(events);

  return { events, expectedCash };
}

// ─── Find Active Shift for Cashier ─────────────────────────

export async function findActiveShiftForCashier(cashierId: string) {
  return prisma.cashierShift.findFirst({
    where: { cashierId, status: ShiftStatus.OPEN },
  });
}
