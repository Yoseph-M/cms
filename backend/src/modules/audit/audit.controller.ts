import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { queryAuditFeed } from './auditFeed';

/**
 * GET /api/audit/feed
 *
 * One page of the unified accountability stream (staff activity + login
 * history). Query: search, action, entity, order=newest|oldest, cursor, limit.
 */
export async function getAuditFeed(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const page = await queryAuditFeed({
      search: (req.query.search as string) || undefined,
      action: (req.query.action as string) || undefined,
      entity: (req.query.entity as string) || undefined,
      order: req.query.order === 'oldest' ? 'asc' : 'desc',
      cursor: (req.query.cursor as string) || undefined,
      limit: Number(req.query.limit) || 50,
    });

    return res.json(page);
  } catch (error) {
    return next(error);
  }
}
