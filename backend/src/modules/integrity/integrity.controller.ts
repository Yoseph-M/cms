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

/**
 * POST /api/integrity/:id/resolve
 * Resolve an integrity issue with notes
 */
export async function resolveIssue(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { resolutionNotes } = req.body;
    const resolvedById = req.user!.userId;

    const issue = await IntegrityService.resolveIntegrityIssue({
      issueId: id,
      resolvedById,
      resolutionNotes,
    });

    return res.json(issue);
  } catch (error: any) {
    logger.error({ error, issueId: req.params.id }, 'Failed to resolve integrity issue');
    return next(error);
  }
}
