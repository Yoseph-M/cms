import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import * as CashDrawerService from './cashDrawer.service';
import { logger } from '../../utils/logger';

/**
 * POST /api/cash-drawer/:shiftId/entries
 * Record a cash drawer entry (payout, petty cash, adjustment)
 */
export async function createEntry(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { shiftId } = req.params;
    const { type, amountMinor, notes } = req.body;
    const performedById = req.user!.userId;

    const event = await CashDrawerService.recordCashDrawerEntry({
      shiftId,
      type,
      amountMinor,
      notes,
      performedById,
    });

    return res.status(201).json(event);
  } catch (error: any) {
    logger.error({ error, shiftId: req.params.shiftId }, 'Failed to create cash drawer entry');
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
    const result = await CashDrawerService.getShiftLedger(shiftId);
    return res.json(result);
  } catch (error: any) {
    logger.error({ error, shiftId: req.params.shiftId }, 'Failed to get cash drawer ledger');
    return next(error);
  }
}
