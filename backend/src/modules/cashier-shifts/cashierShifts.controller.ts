import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import * as ShiftService from './cashierShifts.service';
import { logger } from '../../utils/logger';

/**
 * POST /api/shifts
 * Open a new cashier shift (self-service)
 * Cashier can ONLY open shift for themselves
 */
export async function openShift(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { openingCashMinor } = req.body;
    const userId = req.user!.userId;
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

    // Server-authoritative: cashier can only open shift for themselves
    const shift = await ShiftService.openShift({
      cashierId: userId,
      openingCashMinor,
      openedById: userId,
      idempotencyKey,
    });

    return res.status(201).json(shift);
  } catch (error: any) {
    logger.error({ error }, 'Failed to open shift');
    return next(error);
  }
}

/**
 * POST /api/shifts/admin
 * Administrative shift open (manager/owner only)
 * Allows opening a shift for another cashier
 */
export async function openShiftAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { cashierId, openingCashMinor } = req.body;
    const openedById = req.user!.userId;
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

    if (!cashierId) {
      return res.status(400).json({ 
        error: 'cashierId is required for administrative shift opening' 
      });
    }

    const shift = await ShiftService.openShift({
      cashierId,
      openingCashMinor,
      openedById,
      idempotencyKey,
    });

    return res.status(201).json(shift);
  } catch (error: any) {
    logger.error({ error, cashierId: req.body.cashierId }, 'Failed to open shift (admin)');
    return next(error);
  }
}

/**
 * GET /api/shifts/current
 * Get the current active shift for the authenticated user
 * Cashiers: can only see their own shift
 * Managers/Owners: can query by cashierId
 */
export async function getCurrentShift(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.userId;
    const userRole = req.user!.role;
    const queryCashierId = req.query.cashierId as string | undefined;

    let cashierId: string;

    // Authorization: Cashiers can only query their own shift
    if (userRole === 'CASHIER') {
      cashierId = userId;
      
      if (queryCashierId && queryCashierId !== userId) {
        return res.status(403).json({ 
          error: 'Forbidden: Cashiers can only view their own shift' 
        });
      }
    } else {
      // Managers and Owners can query by cashierId or default to self
      cashierId = queryCashierId || userId;
    }

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
 * Cashiers: can only close their own shift
 * Managers/Owners: can close any shift
 */
export async function closeShift(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { declaredCashMinor, declaredCardMinor, declaredMobileMinor, notes, reason } = req.body;
    const closedById = req.user!.userId;
    const userRole = req.user!.role;
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

    // Authorization check: Cashiers can only close their own shift
    if (userRole === 'CASHIER') {
      const shift = await ShiftService.getShiftById(id);
      
      if (!shift) {
        return res.status(404).json({ error: 'Shift not found' });
      }

      if (shift.cashierId !== closedById) {
        return res.status(403).json({ 
          error: 'Forbidden: Cashiers can only close their own shift' 
        });
      }
    }

    const shift = await ShiftService.closeShift({
      shiftId: id,
      declaredCashMinor,
      declaredCardMinor,
      declaredMobileMinor,
      notes,
      reason,
      closedById,
      idempotencyKey,
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
 * Cashiers: can only see their own history
 * Managers/Owners: can see all history with optional filtering
 */
export async function getShiftHistory(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.userId;
    const userRole = req.user!.role;
    const queryCashierId = req.query.cashierId as string | undefined;
    const status = req.query.status as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

    let cashierId: string | undefined;

    // Authorization: Cashiers can only see their own history
    if (userRole === 'CASHIER') {
      cashierId = userId;
      
      if (queryCashierId && queryCashierId !== userId) {
        return res.status(403).json({ 
          error: 'Forbidden: Cashiers can only view their own shift history' 
        });
      }
    } else {
      // Managers and Owners can filter by cashierId or see all
      cashierId = queryCashierId;
    }

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
