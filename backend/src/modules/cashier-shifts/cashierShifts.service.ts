/**
 * Cashier Shift Service
 * 
 * Manages shift lifecycle: open → close → review.
 * Enforces one active OPEN shift per cashier.
 * Calculates expected cash from the Cash Drawer Ledger.
 */

import { prisma } from '../../services/prisma.service';
import { recordAudit } from '../../services/audit.service';
import { emitToRoom } from '../../services/socket.service';
import { ShiftStatus, CashDrawerEventType, Role } from '@prisma/client';
import { executeInCriticalTransaction } from '../../utils/transaction';
import {
  ValidationError,
  NotFoundError,
  ConflictError,
  ForbiddenError,
  ConcurrentModificationError,
} from '../../utils/errors';
import { logger } from '../../utils/logger';

// ─── Open Shift ────────────────────────────────────────────

interface OpenShiftParams {
  cashierId: string;
  openingCashMinor: number;
  openedById: string;
  idempotencyKey?: string;
}

export async function openShift(params: OpenShiftParams) {
  const { cashierId, openingCashMinor, openedById, idempotencyKey } = params;

  if (openingCashMinor < 0) {
    throw new ValidationError('Opening cash cannot be negative', 'openingCashMinor');
  }

  const result = await executeInCriticalTransaction(prisma, async (tx) => {
    // Check idempotency key first (inside transaction)
    if (idempotencyKey) {
      const existing = await tx.cashierShift.findFirst({
        where: { openIdempotencyKey: idempotencyKey },
      });
      
      if (existing) {
        logger.info(`Idempotent shift open: returning existing shift ${existing.id}`);
        return existing;
      }
    }

    // Enforce: one active OPEN shift per cashier
    const existingOpen = await tx.cashierShift.findFirst({
      where: { cashierId, status: ShiftStatus.OPEN },
    });

    if (existingOpen) {
      throw new ConflictError(
        `Cashier ${cashierId} already has an active shift (${existingOpen.id})`,
        'SHIFT_ALREADY_OPEN'
      );
    }

    // Create the shift
    const shift = await tx.cashierShift.create({
      data: {
        cashierId,
        status: ShiftStatus.OPEN,
        openingCashMinor,
        openedById,
        openIdempotencyKey: idempotencyKey,
      },
    });

    // Create the OPENING_BALANCE ledger entry
    await tx.cashDrawerEvent.create({
      data: {
        shiftId: shift.id,
        type: CashDrawerEventType.OPENING_BALANCE,
        amountMinor: openingCashMinor,
        performedById: openedById,
        notes: 'Shift opened',
      },
    });

    return shift;
  });

  // Audit
  await recordAudit({
    actorId: openedById,
    actionType: 'SHIFT_OPENED',
    targetType: 'CashierShift',
    targetId: result.id,
    details: { cashierId, openingCashMinor },
  });

  // Socket event
  emitToRoom('orders', 'shift:opened', {
    id: result.id,
    cashierId,
    openedAt: result.openedAt.toISOString(),
    openingCashMinor,
  });

  return result;
}

// ─── Close Shift ───────────────────────────────────────────

interface CloseShiftParams {
  shiftId: string;
  declaredCashMinor: number;
  notes?: string;
  reason?: string; // Required if variance != 0
  closedById: string;
  idempotencyKey?: string;
}

/**
 * Close a shift with physical cash count.
 * 
 * IMPORTANT ACCOUNTING SEMANTICS:
 * - Physical count (declaredCashMinor) is NOT a ledger movement
 * - Expected cash is CALCULATED from ledger events
 * - Variance = declaredCashMinor (physical) - expectedCashMinor (ledger)
 * - We DO NOT create a CLOSING_BALANCE ledger event
 * 
 * The shift record stores:
 * - declaredCashMinor: What cashier physically counted
 * - expectedCashMinor: What ledger says should be there
 * - varianceMinor: The difference (derived, not entered)
 */
export async function closeShift(params: CloseShiftParams) {
  const { shiftId, declaredCashMinor, notes, reason, closedById, idempotencyKey } = params;

  if (declaredCashMinor < 0) {
    throw new ValidationError('Declared cash cannot be negative', 'declaredCashMinor');
  }

  const result = await executeInCriticalTransaction(prisma, async (tx) => {
    // Check idempotency key first (inside transaction)
    if (idempotencyKey) {
      const existing = await tx.cashierShift.findFirst({
        where: { closeIdempotencyKey: idempotencyKey },
      });
      
      if (existing) {
        logger.info(`Idempotent shift close: returning existing shift ${existing.id}`);
        return existing;
      }
    }

    // Load shift with optimistic lock check
    const shift = await tx.cashierShift.findUnique({
      where: { id: shiftId },
      include: { cashDrawerEvents: true },
    });

    if (!shift) {
      throw new NotFoundError('CashierShift', shiftId);
    }

    if (shift.status !== ShiftStatus.OPEN) {
      throw new ConflictError(
        `Shift ${shiftId} is not open (current: ${shift.status})`,
        'SHIFT_NOT_OPEN'
      );
    }

    // Calculate expected cash from ledger (server authoritative)
    const expectedCashMinor = calculateExpectedCash(shift.cashDrawerEvents);

    const varianceMinor = declaredCashMinor - expectedCashMinor;

    // Require reason if variance != 0
    if (varianceMinor !== 0 && (!reason || reason.trim().length === 0)) {
      throw new ValidationError(
        'A reason is required when there is a cash variance',
        'reason'
      );
    }

    // Determine new status
    const newStatus = varianceMinor !== 0 ? ShiftStatus.PENDING_REVIEW : ShiftStatus.CLOSED;

    // Update shift atomically
    const updateResult = await tx.cashierShift.updateMany({
      where: { id: shiftId, status: ShiftStatus.OPEN },
      data: {
        status: newStatus,
        closedAt: new Date(),
        expectedCashMinor,
        declaredCashMinor,
        varianceMinor,
        closedById,
        reviewNotes: notes,
        closeIdempotencyKey: idempotencyKey,
      },
    });

    if (updateResult.count === 0) {
      throw new ConcurrentModificationError('CashierShift');
    }

    // NOTE: We do NOT create a CLOSING_BALANCE ledger event
    // The physical count is stored in the shift record itself
    // Ledger remains pure: only movements (in/out), not counts

    // If variance exists, create a VarianceReview
    if (varianceMinor !== 0) {
      await tx.varianceReview.create({
        data: {
          shiftId,
          varianceMinor,
          classification: varianceMinor > 0 ? 'OVER' : 'SHORT',
          cashierReason: reason || '',
        },
      });
    }

    const updatedShift = await tx.cashierShift.findUnique({ where: { id: shiftId } });
    return updatedShift!;
  });

  // Audit
  await recordAudit({
    actorId: closedById,
    actionType: 'SHIFT_CLOSED',
    targetType: 'CashierShift',
    targetId: shiftId,
    details: {
      declaredCashMinor,
      expectedCashMinor: result.expectedCashMinor,
      varianceMinor: result.varianceMinor,
      status: result.status,
    },
  });

  // Socket event
  emitToRoom('orders', 'shift:closed', {
    id: shiftId,
    cashierId: result.cashierId,
    status: result.status,
    varianceMinor: result.varianceMinor,
    closedAt: result.closedAt?.toISOString(),
  });

  return result;
}

// ─── Current Shift ─────────────────────────────────────────

export async function getCurrentShift(cashierId: string) {
  return prisma.cashierShift.findFirst({
    where: { cashierId, status: ShiftStatus.OPEN },
    include: {
      cashDrawerEvents: { orderBy: { createdAt: 'asc' } },
      cashier: { select: { id: true, name: true, role: true } },
    },
  });
}

// ─── Get Shift By ID ───────────────────────────────────────

export async function getShiftById(shiftId: string) {
  return prisma.cashierShift.findUnique({
    where: { id: shiftId },
    include: {
      cashier: { select: { id: true, name: true, role: true } },
    },
  });
}

// ─── Shift History ─────────────────────────────────────────

interface ShiftHistoryParams {
  cashierId?: string;
  status?: ShiftStatus;
  limit?: number;
  offset?: number;
}

export async function getShiftHistory(params: ShiftHistoryParams) {
  const { cashierId, status, limit = 50, offset = 0 } = params;

  const where: {
    cashierId?: string;
    status?: ShiftStatus;
  } = {};
  if (cashierId) where.cashierId = cashierId;
  if (status) where.status = status;

  const [shifts, total] = await Promise.all([
    prisma.cashierShift.findMany({
      where,
      include: {
        cashier: { select: { id: true, name: true, role: true } },
        openedBy: { select: { id: true, name: true } },
        closedBy: { select: { id: true, name: true } },
        varianceReviews: true,
      },
      orderBy: { openedAt: 'desc' },
      skip: offset,
      take: limit,
    }),
    prisma.cashierShift.count({ where }),
  ]);

  return { shifts, total };
}

// ─── Get All Open Shifts ───────────────────────────────────

export async function getOpenShifts() {
  return prisma.cashierShift.findMany({
    where: { status: ShiftStatus.OPEN },
    include: {
      cashier: { select: { id: true, name: true, role: true } },
      cashDrawerEvents: { orderBy: { createdAt: 'asc' } },
    },
    orderBy: { openedAt: 'asc' },
  });
}

// ─── Helper: Calculate Expected Cash ───────────────────────

interface LedgerEntry {
  type: CashDrawerEventType;
  amountMinor: number;
}

export function calculateExpectedCash(events: LedgerEntry[]): number {
  let expected = 0;

  for (const event of events) {
    switch (event.type) {
      case CashDrawerEventType.OPENING_BALANCE:
      case CashDrawerEventType.CASH_SETTLEMENT:
        expected += event.amountMinor;
        break;
      case CashDrawerEventType.CASH_PAYOUT:
      case CashDrawerEventType.PETTY_CASH:
        expected -= event.amountMinor;
        break;
      case CashDrawerEventType.CASH_ADJUSTMENT:
        // Adjustment can be positive or negative
        expected += event.amountMinor;
        break;
      // CLOSING_BALANCE is informational, doesn't affect expected
      case CashDrawerEventType.CLOSING_BALANCE:
        break;
    }
  }

  return expected;
}
