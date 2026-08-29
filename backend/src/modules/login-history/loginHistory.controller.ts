import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { prisma } from '../../services/prisma.service';
import { logger } from '../../utils/logger';

/**
 * GET /api/login-history
 * Get all login history records, paginated.
 * Accessible only by OWNER role for security monitoring.
 */
export async function getAllLoginHistory(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const skip = (page - 1) * limit;
    const outcome = req.query.outcome as string | undefined;
    const userId = req.query.userId as string | undefined;

    const where: Record<string, unknown> = {};
    
    if (outcome && ['SUCCESS', 'FAILURE', 'LOCKED'].includes(outcome)) {
      where.outcome = outcome;
    }
    
    if (userId) {
      where.userId = userId;
    }

    const [loginRecords, total] = await Promise.all([
      prisma.loginHistory.findMany({
        where,
        include: {
          user: {
            select: { id: true, name: true, role: true, username: true, phone: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.loginHistory.count({ where }),
    ]);

    return res.json({
      data: loginRecords,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    logger.error({ error }, 'Failed to fetch login history');
    return next(error);
  }
}

/**
 * GET /api/login-history/stats
 * Get login statistics for dashboard
 * Accessible only by OWNER role
 */
export async function getLoginStats(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [todayLogins, totalLogins, failedToday, lockedToday] = await Promise.all([
      prisma.loginHistory.count({
        where: {
          outcome: 'SUCCESS',
          createdAt: { gte: today },
        },
      }),
      prisma.loginHistory.count({
        where: { outcome: 'SUCCESS' },
      }),
      prisma.loginHistory.count({
        where: {
          outcome: 'FAILURE',
          createdAt: { gte: today },
        },
      }),
      prisma.loginHistory.count({
        where: {
          outcome: 'LOCKED',
          createdAt: { gte: today },
        },
      }),
    ]);

    return res.json({
      todayLogins,
      totalLogins,
      failedToday,
      lockedToday,
    });
  } catch (error: any) {
    logger.error({ error }, 'Failed to fetch login stats');
    return next(error);
  }
}
