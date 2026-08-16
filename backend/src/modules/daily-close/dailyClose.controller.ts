import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import * as DailyCloseService from './dailyClose.service';
import { logger } from '../../utils/logger';

/**
 * GET /api/daily-close/current
 * Get current daily close status
 */
export async function getCurrentStatus(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const businessDate = req.query.date as string | undefined;
    const status = await DailyCloseService.getCurrentDailyClose(businessDate);
    return res.json(status);
  } catch (error: any) {
    logger.error({ error }, 'Failed to get current daily close status');
    return next(error);
  }
}

/**
 * POST /api/daily-close/:date/start
 * Calculate aggregates and start the close process
 */
export async function startDailyClose(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { date } = req.params;
    const result = await DailyCloseService.startDailyClose({ businessDate: date });
    return res.json(result);
  } catch (error: any) {
    logger.error({ error, date: req.params.date }, 'Failed to start daily close');
    return next(error);
  }
}

/**
 * POST /api/daily-close/:date/finalize
 * Finalize the daily close
 */
export async function finalizeDailyClose(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { date } = req.params;
    const { reviewNotes } = req.body;
    const closedById = req.user!.userId;

    const result = await DailyCloseService.finalizeDailyClose({
      businessDate: date,
      reviewNotes,
      closedById,
    });

    return res.json(result);
  } catch (error: any) {
    logger.error({ error, date: req.params.date }, 'Failed to finalize daily close');
    return next(error);
  }
}
