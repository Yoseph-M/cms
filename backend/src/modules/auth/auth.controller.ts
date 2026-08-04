import { Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../../services/prisma.service';
import { comparePin, comparePassword, generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../../utils/security';
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
 * NEVER returns pinCodeHash or pinSalt — this is load-bearing for security.
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
 * Password-based authentication for Web App roles (OWNER, MANAGER, CASHIER).
 * Uses standard lockout logic if brute forced.
 */
export async function login(req: Request, res: Response) {
  const { email, password } = req.body;

  const now = Date.now();

  const user = await prisma.user.findUnique({
    where: { email },
  });

  logger.info({ email, found: !!user, isActive: user?.isActive, role: user?.role, hasPasswordHash: !!user?.passwordHash }, 'Login attempt debug');

  if (!user || !user.isActive) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  // Web roles only
  if (user.role === Role.WAITER) {
    return res.status(403).json({ error: 'Waiters must use PIN login on the mobile app.' });
  }

  const lockoutState = await prisma.loginAttempt.findUnique({
    where: { userId: user.id },
  });

  if (lockoutState) {
    if (lockoutState.lockedUntil > now) {
      const remainingMinutes = Math.ceil((lockoutState.lockedUntil - now) / 60000);
      return res.status(429).json({
        error: `Account locked due to too many failed login attempts. Try again in ${remainingMinutes} minutes.`,
        lockedUntil: lockoutState.lockedUntil,
        remainingMinutes,
      });
    } else if (lockoutState.lockedUntil !== 0) {
      await prisma.loginAttempt.delete({ where: { userId: user.id } });
    }
  }

  const isPasswordValid = user.passwordHash ? await comparePassword(password, user.passwordHash) : false;
  logger.info({ email, isPasswordValid, passwordHashLength: user.passwordHash?.length }, 'Password comparison result');
  
  if (!isPasswordValid) {
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
        error: 'Account locked due to too many failed login attempts. Try again in 15 minutes.',
        lockedUntil,
        remainingMinutes: 15,
      });
    } else {
      return res.status(401).json({
        error: `Invalid email or password. ${5 - attempts} attempts remaining.`,
        attemptsRemaining: 5 - attempts,
      });
    }
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

  return res.json({
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      name: user.name,
      role: user.role,
      email: user.email,
      phone: user.phone,
    },
  });
}

/**
 * POST /auth/pin-login
 * Unified PIN-based authentication for all roles.
 * Applies persistent lockout: 5 failed attempts → 15 minute lockout.
 */
export async function pinLogin(req: Request, res: Response) {
  const { userId, pinCode } = req.body;

  const now = Date.now();

  // Check lockout state
  const lockoutState = await prisma.loginAttempt.findUnique({
    where: { userId },
  });

  if (lockoutState) {
    if (lockoutState.lockedUntil > now) {
      const remainingMinutes = Math.ceil((lockoutState.lockedUntil - now) / 60000);
      return res.status(429).json({
        error: `Account locked due to too many failed PIN attempts. Try again in ${remainingMinutes} minutes.`,
        lockedUntil: lockoutState.lockedUntil,
        remainingMinutes,
      });
    } else if (lockoutState.lockedUntil !== 0) {
      // Lockout expired, clear it
      await prisma.loginAttempt.delete({ where: { userId } });
    }
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user || !user.isActive) {
    return res.status(401).json({ error: 'User not found or inactive.' });
  }

  // Restrict to mobile app (WAITER)
  if (user.role !== Role.WAITER) {
    return res.status(403).json({ error: 'Web app users (Owner/Manager/Cashier) must use password login.' });
  }

  // Ensure pinSalt and pinCodeHash exist
  if (!user.pinSalt || !user.pinCodeHash) {
    return res.status(401).json({ error: 'PIN not set for this user.' });
  }

  const isPinValid = comparePin(pinCode, user.pinSalt, user.pinCodeHash);
  if (!isPinValid) {
    const currentLockout = await prisma.loginAttempt.findUnique({ where: { userId } });
    const attempts = currentLockout ? currentLockout.failedCount + 1 : 1;
    let lockedUntil = 0;

    if (attempts >= 5) {
      lockedUntil = now + 15 * 60 * 1000; // 15 mins
    }

    await prisma.loginAttempt.upsert({
      where: { userId },
      update: { failedCount: attempts, lockedUntil },
      create: { userId, failedCount: attempts, lockedUntil },
    });

    if (attempts >= 5) {
      return res.status(429).json({
        error: 'Account locked due to too many failed PIN attempts. Try again in 15 minutes.',
        lockedUntil,
        remainingMinutes: 15,
      });
    } else {
      return res.status(401).json({
        error: `Invalid PIN code. ${5 - attempts} attempts remaining.`,
        attemptsRemaining: 5 - attempts,
      });
    }
  }

  // Clear lockout on success
  if (lockoutState) {
    await prisma.loginAttempt.delete({ where: { userId } });
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

  return res.json({
    accessToken,
    refreshToken,
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
  const { refreshToken: token } = req.body;

  try {
    const payload = verifyRefreshToken(token);
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'User inactive or no longer exists.' });
    }

    const tHash = hashToken(token);
    const storedToken = await prisma.refreshToken.findUnique({
      where: { tokenHash: tHash },
    });

    if (!storedToken) {
      return res.status(401).json({ error: 'Invalid refresh token.' });
    }

    if (storedToken.revoked) {
      // Token reuse detected! Revoke all tokens for this user.
      logger.warn({ userId: user.id }, 'Refresh token reuse detected. Revoking all tokens.');
      await prisma.refreshToken.updateMany({
        where: { userId: user.id },
        data: { revoked: true },
      });
      return res.status(401).json({ error: 'Session compromised. Please log in again.' });
    }

    // Mark current token as revoked
    await prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revoked: true },
    });

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

    return res.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired refresh token.' });
  }
}

export async function logout(req: Request, res: Response) {
  // Client discards JWT tokens
  return res.json({ message: 'Logged out successfully.' });
}
