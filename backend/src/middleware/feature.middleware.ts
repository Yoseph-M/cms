import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.middleware';
import { prisma } from '../services/prisma.service';

/**
 * Middleware to ensure a feature flag is enabled.
 * Default value for these feature flags is assumed to be 'true' if the key doesn't exist.
 */
export function requireFeatureFlag(key: string) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const setting = await prisma.systemSetting.findUnique({
        where: { key }
      });
      
      // Default to true if not explicitly set to false
      const isEnabled = setting ? setting.value === 'true' : true;

      if (!isEnabled) {
        return res.status(403).json({
          error: `Feature disabled: The ${key} feature is currently turned off.`
        });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

export const requireManagerDashboard = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (req.user?.role === 'OWNER') return next();
  if (req.user?.role === 'MANAGER') {
    try {
      const setting = await prisma.systemSetting.findUnique({
        where: { key: 'managerDashboardEnabled' }
      });
      const isEnabled = setting ? setting.value === 'true' : true;
      
      if (!isEnabled) {
        return res.status(403).json({ error: 'Manager dashboard is disabled.' });
      }
    } catch (error) {
      return next(error);
    }
  }
  next();
};
