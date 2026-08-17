import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import * as CashDrawerService from './cashDrawer.service';
import { logger } from '../../utils/logger';

/**
 * POST /api/cash-drawer/payout
 * Record a cash payout from the active shift
 */
export async function recordPayout(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { shiftId, amountMinor, reason, reference } = req.body;
    const performedById = req.user!.userId;
    const userRole = req.user!.role;
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

    // Authorization: Cashier can only payout from their own shift
    if (userRole === 'CASHIER') {
      const shift = await CashDrawerService.findActiveShiftForCashier(performedById);
      if (!shift || shift.id !== shiftId) {
        return res.status(403).json({ 
          error: 'Forbidden: Cashiers can only record payouts from their own active shift' 
        });
      }
    }

    const event = await CashDrawerService.recordCashPayout({
      shiftId,
      amountMinor,
      reason,
      reference,
      performedById,
      idempotencyKey,
    });

    return res.status(201).json(event);
  } catch (error: any) {
    logger.error({ error }, 'Failed to record cash payout');
    return next(error);
  }
}

/**
 * POST /api/cash-drawer/petty-cash
 * Record a petty cash withdrawal (Manager/Owner only)
 */
export async function recordPettyCash(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { shiftId, amountMinor, reason, category } = req.body;
    const performedById = req.user!.userId;
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

    const event = await CashDrawerService.recordPettyCash({
      shiftId,
      amountMinor,
      reason,
      category,
      performedById,
      idempotencyKey,
    });

    return res.status(201).json(event);
  } catch (error: any) {
    logger.error({ error }, 'Failed to record petty cash');
    return next(error);
  }
}

/**
 * POST /api/cash-drawer/adjustment
 * Record a cash adjustment (Owner only)
 */
export async function recordAdjustment(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { shiftId, amountMinor, reason } = req.body;
    const performedById = req.user!.userId;
    const performerName = req.user!.name;
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

    const event = await CashDrawerService.recordCashAdjustment({
      shiftId,
      amountMinor,
      reason,
      approvedBy: performerName, // Owner is self-approving
      performedById,
      idempotencyKey,
    });

    return res.status(201).json(event);
  } catch (error: any) {
    logger.error({ error }, 'Failed to record cash adjustment');
    return next(error);
  }
}

/**
 * GET /api/cash-drawer/:shiftId
 * Get the full ledger for a shift
 */
export async function getLedger(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { shiftId } = req.params;
    const userId = req.user!.userId;
    const userRole = req.user!.role;

    // Authorization: Cashier can only view their own shift
    if (userRole === 'CASHIER') {
      const shift = await CashDrawerService.findActiveShiftForCashier(userId);
      if (!shift || shift.id !== shiftId) {
        return res.status(403).json({ 
          error: 'Forbidden: Cashiers can only view their own shift ledger' 
        });
      }
    }

    const result = await CashDrawerService.getShiftLedger(shiftId);
    return res.json(result);
  } catch (error: any) {
    logger.error({ error, shiftId: req.params.shiftId }, 'Failed to get cash drawer ledger');
    return next(error);
  }
}
