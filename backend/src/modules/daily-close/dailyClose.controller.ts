import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import * as DailyCloseService from './dailyClose.service';
import { getCurrentBusinessDate as getServerBusinessDate } from '../../utils/businessTime';
import { logger } from '../../utils/logger';

/**
 * GET /api/daily-close/business-date
 * Get current business date (server-authoritative)
 * This is the single source of truth for "what day is it?"
 */
export async function getCurrentBusinessDate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const businessDate = getServerBusinessDate();
    return res.json({ businessDate });
  } catch (error: any) {
    logger.error({ error }, 'Failed to get current business date');
    return next(error);
  }
}

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
    
    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ 
        error: 'Invalid date format. Expected YYYY-MM-DD' 
      });
    }
    
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
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ 
        error: 'Invalid date format. Expected YYYY-MM-DD' 
      });
    }

    const result = await DailyCloseService.finalizeDailyClose({
      businessDate: date,
      reviewNotes,
      closedById,
      idempotencyKey,
    });

    return res.json(result);
  } catch (error: any) {
    logger.error({ error, date: req.params.date }, 'Failed to finalize daily close');
    return next(error);
  }
}
