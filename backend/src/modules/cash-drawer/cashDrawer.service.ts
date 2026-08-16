/**
 * Cash Drawer Service
 * 
 * Manages the cash drawer ledger — an immutable append-only log of all cash movements.
 * Every cash movement (settlements, payouts, adjustments) is recorded as a CashDrawerEvent.
 * 
 * The expected cash formula:
 *   expected = opening_balance + cash_settlements - payouts ± adjustments
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

interface CashDrawerEntryParams {
  shiftId: string;
  type: 'CASH_PAYOUT' | 'PETTY_CASH' | 'CASH_ADJUSTMENT';
  amountMinor: number;
  notes?: string;
  performedById: string;
}

export async function recordCashDrawerEntry(params: CashDrawerEntryParams) {
  const { shiftId, type, amountMinor, notes, performedById } = params;

  const result = await executeInCriticalTransaction(prisma, async (tx) => {
    // Verify shift is OPEN
    const shift = await tx.cashierShift.findUnique({ where: { id: shiftId } });
    if (!shift) {
      throw new NotFoundError('CashierShift', shiftId);
    }
    if (shift.status !== ShiftStatus.OPEN) {
      throw new ConflictError(
        `Cannot add entries to a ${shift.status} shift`,
        'SHIFT_NOT_OPEN'
      );
    }

    if (type === 'CASH_PAYOUT' || type === 'PETTY_CASH') {
      if (amountMinor <= 0) {
        throw new ValidationError('Payout amount must be positive', 'amountMinor');
      }
    }

    const event = await tx.cashDrawerEvent.create({
      data: {
        shiftId,
        type: CashDrawerEventType[type],
        amountMinor,
        performedById,
        notes,
      },
    });

    return event;
  });

  // Audit
  await recordAudit({
    actorId: performedById,
    actionType: `CASH_DRAWER_${type}`,
    targetType: 'CashDrawerEvent',
    targetId: result.id,
    details: { shiftId, type, amountMinor, notes },
  });

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
