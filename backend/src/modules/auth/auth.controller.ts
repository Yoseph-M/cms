import { Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../../services/prisma.service';
import { comparePassword, hashPassword, generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../../utils/security';
import { logger } from '../../utils/logger';
import { Role } from '@prisma/client';

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
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
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({
    where: { email },
  });

  logger.info({ email, found: !!user, isActive: user?.isActive, role: user?.role, hasPasswordHash: !!user?.passwordHash }, 'Login attempt debug');

  if (!user || !user.isActive) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  // Check lockout state
  const lockoutState = await prisma.loginAttempt.findUnique({
    where: { userId: user.id },
  });

  const now = Date.now();
  if (lockoutState) {
    if (lockoutState.lockedUntil > now) {
      const remainingMinutes = Math.ceil((lockoutState.lockedUntil - now) / 60000);
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
  
  logger.info({ email, isPasswordValid, passwordHashLength: user.passwordHash?.length }, 'Password comparison result');

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

    if (attempts >= 5) {
      return res.status(429).json({
        error: 'Account locked due to too many failed attempts. Try again in 15 minutes.',
        lockedUntil,
        remainingMinutes: 15,
      });
    }

    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  // Clear lockout on success
  if (lockoutState) {
    await prisma.loginAttempt.delete({ where: { userId: user.id } });
  }

  const tokenPayload = {
    userId: user.id,
    role: user.role,
    name: user.name,
    email: user.email,
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

  res.cookie('refresh_token', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  // Refresh token is ONLY delivered via HttpOnly cookie — never in JSON
  return res.json({
    accessToken,
    user: {
      id: user.id,
      name: user.name,
      role: user.role,
      email: user.email,
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
      logger.warn({ userId: user.id }, 'Refresh token reuse detected or token expired. Revoking all tokens.');
      await prisma.refreshToken.updateMany({
        where: { userId: user.id },
        data: { revoked: true },
      });
      res.clearCookie('refresh_token');
      return res.status(401).json({ error: 'Session compromised. Please log in again.' });
    }

    const tokenPayload = {
      userId: user.id,
      role: user.role,
      name: user.name,
      email: user.email,
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

    res.cookie('refresh_token', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    // Refresh token is ONLY delivered via HttpOnly cookie — never in JSON
    return res.json({
      accessToken: newAccessToken,
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

  if (token && typeof token === 'string') {
    const tHash = hashToken(token);

    const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: tHash } });
    if (stored && !stored.revoked) {
      // Revoke this token and the rest of the user's refresh family (full session kill)
      await prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revoked: false },
        data: { revoked: true },
      });
    } else if (stored) {
      await prisma.refreshToken.update({
        where: { id: stored.id },
        data: { revoked: true },
      });
    }
  }

  res.clearCookie('refresh_token');
  return res.status(200).json({ message: 'Logged out successfully.' });
}
