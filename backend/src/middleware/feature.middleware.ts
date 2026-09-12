import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.middleware';
import { prisma } from '../services/prisma.service';

/**
 * Tiny TTL cache for feature flags.
 *
 * The menu availability toggle (and every other guarded route) used to hit
 * `systemSetting.findUnique` on EVERY request — an extra DB round-trip in the
 * hot path just to read a value that changes at most a few times a day.
 * Flags are now served from memory for up to 30s; the settings write path
 * clears the cache immediately, so a flag flip takes effect on the next
 * request, not after the TTL.
 */
const FLAG_TTL_MS = 30_000;
const flagCache = new Map<string, { value: boolean; expiresAt: number }>();

export function clearFeatureFlagCache(): void {
  flagCache.clear();
}

async function readFlag(key: string): Promise<boolean> {
  const cached = flagCache.get(key);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.value;
  }

  try {
    const setting = await prisma.systemSetting.findUnique({ where: { key } });
    const value = setting ? setting.value === 'true' : true;
    flagCache.set(key, { value, expiresAt: Date.now() + FLAG_TTL_MS });
    return value;
  } catch (error) {
    // DB hiccup: serve the last known value (stale-while-error) when we have
    // one, so a transient outage doesn't fail every guarded request. Only
    // propagate the error when we've never successfully read the flag.
    if (cached) {
      return cached.value;
    }
    throw error;
  }
}

/**
 * Middleware to ensure a feature flag is enabled.
 */
export function requireFeatureFlag(key: string) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const isEnabled = await readFlag(key);
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
      const isEnabled = await readFlag('managerDashboardEnabled');
      if (!isEnabled) {
        return res.status(403).json({ error: 'Manager dashboard is disabled.' });
      }
    } catch (error) {
      return next(error);
    }
  }
  next();
};
