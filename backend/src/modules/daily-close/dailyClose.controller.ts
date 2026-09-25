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
 * GET /api/daily-close/preview
 * Live figures for the current business day, without writing anything. Used by
 * the End of Day screens so the numbers on screen are always that date's own
 * sales rather than a stale or accumulated total.
 */
export async function previewDailyClose(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const date = req.query.date as string | undefined;
    const preview = await DailyCloseService.previewDailyClose(date);
    return res.json(preview);
  } catch (error: any) {
    logger.error({ error }, 'Failed to preview daily close');
    return next(error);
  }
}

/**
 * GET /api/daily-close/history
 * Day-by-day revenue history for the End of Day screen. Each row is the
 * server-side snapshot for one business date, newest first.
 */
export async function getDailyCloseHistory(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const parsed = Number.parseInt((req.query.limit as string | undefined) ?? '', 10);
    const limit = Number.isNaN(parsed) ? 30 : parsed;
    const history = await DailyCloseService.listDailyCloseHistory(limit);
    return res.json(history);
  } catch (error: any) {
    logger.error({ error }, 'Failed to list daily close history');
    return next(error);
  }
}

/**
 * GET /api/daily-close/reconciliation
 * Compare each approved day's takings with that same day's paid revenue and
 * flag the days that no longer agree. Read-only.
 */
export async function getReconciliation(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const parsed = Number.parseInt((req.query.days as string | undefined) ?? '', 10);
    const days = Number.isNaN(parsed) ? undefined : parsed;
    const report = await DailyCloseService.reconcileClosedDays({ days });
    return res.json(report);
  } catch (error: any) {
    logger.error({ error }, 'Failed to reconcile closed days');
    return next(error);
  }
}

/**
 * POST /api/daily-close/:date/start
 * Send the request to close the day (usually the cashier).
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

    const result = await DailyCloseService.startDailyClose({
      businessDate: date,
      requestedById: req.user!.userId,
    });
    return res.json(result);
  } catch (error: any) {
    logger.error({ error, date: req.params.date }, 'Failed to request daily close');
    return next(error);
  }
}

/**
 * POST /api/daily-close/:date/approve
 * Manager approves the close request — this locks the day.
 */
export async function approveDailyClose(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { date } = req.params;
    const { reviewNotes } = req.body ?? {};
    const decidedById = req.user!.userId;
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        error: 'Invalid date format. Expected YYYY-MM-DD'
      });
    }

    const result = await DailyCloseService.approveDailyClose({
      businessDate: date,
      reviewNotes,
      decidedById,
      idempotencyKey,
    });

    return res.json(result);
  } catch (error: any) {
    logger.error({ error, date: req.params.date }, 'Failed to approve daily close');
    return next(error);
  }
}

/**
 * POST /api/daily-close/:date/reject
 * Manager disapproves the close request — the floor can request again.
 */
export async function rejectDailyClose(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { date } = req.params;
    const { reviewNotes } = req.body ?? {};
    const decidedById = req.user!.userId;

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        error: 'Invalid date format. Expected YYYY-MM-DD'
      });
    }

    const result = await DailyCloseService.rejectDailyClose({
      businessDate: date,
      reviewNotes,
      decidedById,
    });

    return res.json(result);
  } catch (error: any) {
    logger.error({ error, date: req.params.date }, 'Failed to reject daily close');
    return next(error);
  }
}
