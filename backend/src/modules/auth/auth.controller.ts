import { Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../../services/prisma.service';
import { comparePassword, hashPassword, generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../../utils/security';
import { logger } from '../../utils/logger';
import { Role } from '@prisma/client';

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

const REFRESH_TOKEN_COOKIE = 'refresh_token';
const REFRESH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days, matches JWT expiry

type SameSiteOption = 'strict' | 'lax' | 'none';

interface RefreshCookieSecurity {
  secure: boolean;
  sameSite: SameSiteOption;
}

/** Whether the browser-facing connection is HTTPS (direct TLS or X-Forwarded-Proto). */
function isSecureConnection(req: Request): boolean {
  if (req.secure) return true;
  const forwarded = req.headers['x-forwarded-proto'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim() === 'https';
  }
  return false;
}

/**
 * True when the request is a cross-site XHR/fetch (browser `Origin` header host
 * differs from the `Host` header). Same-origin deployments (nginx proxying the
 * SPA and /api from one origin) and non-browser clients never need SameSite=None.
 */
function isCrossSiteRequest(req: Request): boolean {
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (!origin || !host) return false;
  try {
    return new URL(origin).host !== host;
  } catch {
    return false;
  }
}

/**
 * Resolve the `Secure` / `SameSite` pair for the refresh cookie.
 *
 * This is the single policy used to WRITE the cookie (login, refresh) AND to
 * CLEAR it (logout, replay detection), so attributes always match — mismatched
 * `path`/`sameSite`/`secure` between set and clear is a common reason a
 * refresh cookie survives login but is dropped on a later request.
 *
 * Rules (least permissive that works for each deployment):
 *  - `secure` follows the real connection protocol (direct TLS or
 *    `X-Forwarded-Proto` from nginx). Over plain HTTP the flag is omitted —
 *    marking it Secure on an HTTP deployment makes browsers silently drop the
 *    cookie and forces a re-login on every page refresh.
 *  - `sameSite` is `'none'` only when the SPA and API are on different sites
 *    (cross-origin credentialed requests REQUIRE None); same-origin and
 *    non-browser requests stay on the safer `'lax'`.
 *  - Explicit overrides `COOKIE_SECURE=true|false` and
 *    `COOKIE_SAME_SITE=strict|lax|none` win over the auto-detection for
 *    unusual topologies (e.g. TLS terminated ahead of the API without
 *    forwarded headers, or a forced None cookie on a same-site host).
 *
 * SameSite=None is only ever emitted together with Secure.
 */
function resolveCookieSecurity(req: Request): RefreshCookieSecurity {
  const overrideSecure = (process.env.COOKIE_SECURE || '').toLowerCase();
  const overrideSameSite = (process.env.COOKIE_SAME_SITE || '').toLowerCase();
  const isProduction = process.env.NODE_ENV === 'production';
  const crossSite = isCrossSiteRequest(req);

  let sameSite: SameSiteOption;
  if (overrideSameSite === 'strict' || overrideSameSite === 'lax' || overrideSameSite === 'none') {
    sameSite = overrideSameSite;
  } else {
    sameSite = isProduction && crossSite ? 'none' : 'lax';
  }

  let secure: boolean;
  if (overrideSecure === 'true') secure = true;
  else if (overrideSecure === 'false') secure = false;
  else if (sameSite === 'none') secure = true; // SameSite=None is only valid over HTTPS
  else secure = isProduction ? isSecureConnection(req) : false;

  return { secure, sameSite };
}

/**
 * Single source of truth for the refresh cookie attributes used to WRITE it.
 */
function getRefreshCookieOptions(req: Request): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: SameSiteOption;
  path: string;
  maxAge: number;
} {
  const { secure, sameSite } = resolveCookieSecurity(req);
  return {
    httpOnly: true,
    secure,
    sameSite,
    path: '/',
    maxAge: REFRESH_COOKIE_MAX_AGE,
  };
}

/**
 * Clears the refresh cookie with the SAME attributes used to set it
 * (`path`, `sameSite`, `secure`) so browsers actually delete it.
 */
function clearRefreshCookie(req: Request, res: Response) {
  const { secure, sameSite } = resolveCookieSecurity(req);
  res.clearCookie(REFRESH_TOKEN_COOKIE, {
    httpOnly: true,
    secure,
    sameSite,
    path: '/',
  });
}

/**
 * GET /auth/roles
 * Returns the list of roles that have at least one active user.
 */
export async function getRoles(req: Request, res: Response) {
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { role: true },
  });

  const roleSet = new Set(users.map((u) => u.role));
  const roles = Object.values(Role).filter((r) => roleSet.has(r));

  return res.json(roles);
}

/**
 * GET /auth/users-by-role/:role
 * Returns { id, name }[] for active users in that role.
 * Never returns sensitive credential fields.
 */
export async function getUsersByRole(req: Request, res: Response) {
  const { role } = req.params;

  // Validate role is a real enum value
  if (!Object.values(Role).includes(role as Role)) {
    return res.status(400).json({ error: `Invalid role: ${role}` });
  }

  const users = await prisma.user.findMany({
    where: { role: role as Role, isActive: true },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  return res.json(users);
}

/**
 * POST /auth/login
 * Password-based authentication for ALL roles.
 * Uses standard lockout logic if brute forced.
 */
export async function login(req: Request, res: Response) {
  const { username, password } = req.body;

  const user = await prisma.user.findUnique({
    where: { username },
  });

  if (!user || !user.isActive) {
    logger.info({ username, found: !!user, isActive: user?.isActive, role: user?.role, outcome: 'failure' }, 'auth.login.failure');
    
    // Record failure if user exists but is inactive (or not found)
    if (user) {
      await prisma.loginHistory.create({
        data: {
          userId: user.id,
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          outcome: 'FAILURE',
        },
      });
    }

    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  // Check lockout state
  const lockoutState = await prisma.loginAttempt.findUnique({
    where: { userId: user.id },
  });

  const now = Date.now();
  if (lockoutState) {
    if (lockoutState.lockedUntil > now) {
      const remainingMinutes = Math.ceil((lockoutState.lockedUntil - now) / 60000);
      
      await prisma.loginHistory.create({
        data: {
          userId: user.id,
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          outcome: 'LOCKED',
        },
      });

      return res.status(429).json({
        error: `Account locked due to too many failed attempts. Try again in ${remainingMinutes} minutes.`,
        lockedUntil: lockoutState.lockedUntil,
        remainingMinutes,
      });
    } else if (lockoutState.lockedUntil !== 0) {
      // Lockout expired, clear it
      await prisma.loginAttempt.delete({ where: { userId: user.id } });
    }
  }

  const isPasswordValid = user.passwordHash ? await comparePassword(password, user.passwordHash) : false;

  if (!isPasswordValid) {
    // Track failed attempts for brute-force protection
    const currentLockout = await prisma.loginAttempt.findUnique({ where: { userId: user.id } });
    const attempts = currentLockout ? currentLockout.failedCount + 1 : 1;
    let lockedUntil = 0;

    if (attempts >= 5) {
      lockedUntil = now + 15 * 60 * 1000; // 15 mins
    }

    await prisma.loginAttempt.upsert({
      where: { userId: user.id },
      update: { failedCount: attempts, lockedUntil },
      create: { userId: user.id, failedCount: attempts, lockedUntil },
    });

    await prisma.loginHistory.create({
      data: {
        userId: user.id,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        outcome: attempts >= 5 ? 'LOCKED' : 'FAILURE',
      },
    });

    if (attempts >= 5) {
      logger.info({ username, attempts, outcome: 'locked' }, 'auth.login.locked');
      return res.status(429).json({
        error: 'Account locked due to too many failed attempts. Try again in 15 minutes.',
        lockedUntil,
        remainingMinutes: 15,
      });
    }

    logger.info({ username, attempts, outcome: 'failure' }, 'auth.login.failure');
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  // Clear lockout on success
  if (lockoutState) {
    await prisma.loginAttempt.delete({ where: { userId: user.id } });
  }

  // Record success
  await prisma.loginHistory.create({
    data: {
      userId: user.id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      outcome: 'SUCCESS',
    },
  });

  // Check if Manager Dashboard feature is disabled
  if (user.role === Role.MANAGER) {
    const managerDashboardSetting = await prisma.systemSetting.findUnique({
      where: { key: 'managerDashboardEnabled' }
    });
    const isEnabled = managerDashboardSetting ? managerDashboardSetting.value === 'true' : true;
    
    if (!isEnabled) {
      logger.info({ username, role: user.role, outcome: 'feature_disabled' }, 'auth.login.feature_disabled');
      return res.status(403).json({ 
        error: 'Manager Dashboard is currently disabled. Please contact the system administrator for access.' 
      });
    }
  }

  const tokenPayload = {
    userId: user.id,
    role: user.role,
    name: user.name,
    username: user.username,
  };

  const accessToken = generateAccessToken(tokenPayload);
  const refreshToken = generateRefreshToken(tokenPayload);

  await prisma.refreshToken.create({
    data: {
      tokenHash: hashToken(refreshToken),
      userId: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  // Auto-log attendance for Manager on first login of the day (create-only, immutable)
  if (user.role === Role.MANAGER) {
    const todayLocal = new Date().toISOString().split('T')[0];
    try {
      await prisma.attendance.upsert({
        where: { userId_date: { userId: user.id, date: todayLocal } },
        create: {
          userId: user.id,
          date: todayLocal,
          status: 'PRESENT',
          source: 'SYSTEM_LOGIN',
          note: 'Auto-recorded at login',
        },
        update: {}, // no-op: second login same day must not overwrite
      });
    } catch (e) {
      // Non-critical — do not block login if attendance upsert fails
      logger.warn({ userId: user.id, error: e }, 'Failed to auto-log attendance on login');
    }
  }

  res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, getRefreshCookieOptions(req));

  // Structured auth logging
  logger.info({ userId: user.id, role: user.role, outcome: 'success' }, 'auth.login.success');

  // Refresh token is ONLY delivered via HttpOnly cookie — never in JSON
  return res.json({
    accessToken,
    user: {
      id: user.id,
      name: user.name,
      role: user.role,
      username: user.username,
      phone: user.phone,
    },
  });
}

export async function refreshToken(req: Request, res: Response) {
  // Read from HttpOnly cookie only — do not accept body-based refresh tokens
  const cookiesStr = req.headers.cookie || '';
  const cookies = cookiesStr.split(';').reduce((acc, curr) => {
    const [k, v] = curr.trim().split('=');
    if (k) acc[k] = v;
    return acc;
  }, {} as Record<string, string>);
  
  const token = cookies['refresh_token'];

  if (!token) {
    return res.status(401).json({ error: 'No refresh token provided.' });
  }

  try {
    const payload = verifyRefreshToken(token);
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'User inactive or no longer exists.' });
    }

    const tHash = hashToken(token);

    // Atomic revocation: only succeed if the token is currently non-revoked and not expired
    const revokeResult = await prisma.refreshToken.updateMany({
      where: {
        tokenHash: tHash,
        revoked: false,
        expiresAt: { gt: new Date() },
      },
      data: { revoked: true },
    });

    if (revokeResult.count === 0) {
      // Token was already revoked (replay/reuse) or expired — revoke all tokens for this user
      logger.warn({ userId: user.id, outcome: 'replay_detected' }, 'auth.refresh.replay');
      await prisma.refreshToken.updateMany({
        where: { userId: user.id },
        data: { revoked: true },
      });
      clearRefreshCookie(req, res);
      return res.status(401).json({ error: 'Session compromised. Please log in again.' });
    }

    // Structured auth logging for successful refresh
    logger.info({ userId: user.id, role: user.role, outcome: 'success' }, 'auth.refresh.success');

    const tokenPayload = {
      userId: user.id,
      role: user.role,
      name: user.name,
      username: user.username,
    };

    const newAccessToken = generateAccessToken(tokenPayload);
    const newRefreshToken = generateRefreshToken(tokenPayload);

    await prisma.refreshToken.create({
      data: {
        tokenHash: hashToken(newRefreshToken),
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    res.cookie(REFRESH_TOKEN_COOKIE, newRefreshToken, getRefreshCookieOptions(req));

    // Refresh token is ONLY delivered via HttpOnly cookie — never in JSON
    return res.json({
      accessToken: newAccessToken,
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        username: user.username,
        phone: user.phone,
      },
    });
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired refresh token.' });
  }
}

export async function logout(req: Request, res: Response) {
  const cookiesStr = req.headers.cookie || '';
  const cookies = cookiesStr.split(';').reduce((acc, curr) => {
    const [k, v] = curr.trim().split('=');
    if (k) acc[k] = v;
    return acc;
  }, {} as Record<string, string>);
  
  const token = cookies['refresh_token'];
  let userId: string | undefined;

  if (token && typeof token === 'string') {
    const tHash = hashToken(token);

    const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: tHash } });
    if (stored) {
      userId = stored.userId;
      if (!stored.revoked) {
        // Revoke this token and the rest of the user's refresh family (full session kill)
        await prisma.refreshToken.updateMany({
          where: { userId: stored.userId, revoked: false },
          data: { revoked: true },
        });
      } else {
        await prisma.refreshToken.update({
          where: { id: stored.id },
          data: { revoked: true },
        });
      }
    }
  }

  clearRefreshCookie(req, res);
  
  // Structured auth logging
  logger.info({ userId, outcome: 'success' }, 'auth.logout');
  
  return res.status(200).json({ message: 'Logged out successfully.' });
}
