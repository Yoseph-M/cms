import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import * as IntegrityService from './integrity.service';
import { logger } from '../../utils/logger';

/**
 * GET /api/integrity
 * Get all unresolved integrity issues
 */
export async function getIssues(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const issues = await IntegrityService.getUnresolvedIssues();
    return res.json(issues);
  } catch (error: any) {
    logger.error({ error }, 'Failed to get integrity issues');
    return next(error);
  }
}

/**
 * POST /api/integrity/run
 * Trigger an integrity check run manually
 */
export async function runCheck(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const result = await IntegrityService.runIntegrityChecks();
    return res.json(result);
  } catch (error: any) {
    logger.error({ error }, 'Failed to run integrity checks');
    return next(error);
  }
}
