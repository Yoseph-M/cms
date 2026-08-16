import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import * as ShiftService from './cashierShifts.service';
import { logger } from '../../utils/logger';

/**
 * POST /api/shifts
 * Open a new cashier shift
 */
export async function openShift(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { cashierId, openingCashMinor } = req.body;
    const openedById = req.user!.userId;

    const shift = await ShiftService.openShift({
      cashierId: cashierId || openedById, // Default to self
      openingCashMinor,
      openedById,
    });

    return res.status(201).json(shift);
  } catch (error: any) {
    logger.error({ error }, 'Failed to open shift');
    return next(error);
  }
}

/**
 * GET /api/shifts/current
 * Get the current active shift for the authenticated cashier
 */
export async function getCurrentShift(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const cashierId = (req.query.cashierId as string) || req.user!.userId;
    const shift = await ShiftService.getCurrentShift(cashierId);

    if (!shift) {
      return res.json(null);
    }

    return res.json(shift);
  } catch (error: any) {
    logger.error({ error }, 'Failed to get current shift');
    return next(error);
  }
}

/**
 * POST /api/shifts/:id/close
 * Close an active shift
 */
export async function closeShift(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { declaredCashMinor, notes, reason } = req.body;
    const closedById = req.user!.userId;

    const shift = await ShiftService.closeShift({
      shiftId: id,
      declaredCashMinor,
      notes,
      reason,
      closedById,
    });

    return res.json(shift);
  } catch (error: any) {
    logger.error({ error, shiftId: req.params.id }, 'Failed to close shift');
    return next(error);
  }
}

/**
 * GET /api/shifts/history
 * Get shift history with filters
 */
export async function getShiftHistory(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const cashierId = req.query.cashierId as string | undefined;
    const status = req.query.status as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

    const result = await ShiftService.getShiftHistory({
      cashierId,
      status: status as any,
      limit,
      offset,
    });

    return res.json(result);
  } catch (error: any) {
    logger.error({ error }, 'Failed to get shift history');
    return next(error);
  }
}

/**
 * GET /api/shifts/open
 * Get all currently open shifts (for management)
 */
export async function getOpenShifts(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const shifts = await ShiftService.getOpenShifts();
    return res.json(shifts);
  } catch (error: any) {
    logger.error({ error }, 'Failed to get open shifts');
    return next(error);
  }
}
