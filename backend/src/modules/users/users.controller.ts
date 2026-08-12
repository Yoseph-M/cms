import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { prisma } from '../../services/prisma.service';
import { comparePassword, hashPassword, hashPin, isValidPinFormat } from '../../utils/security';
import { recordAudit } from '../../services/audit.service';
import { Role } from '@prisma/client';
import crypto from 'crypto';

export async function getUsers(req: AuthenticatedRequest, res: Response) {
  const { role, isActive } = req.query;

  const whereClause: any = {};
  if (role) whereClause.role = role as Role;
  
  if (isActive !== undefined) {
    whereClause.isActive = isActive === 'true';
  } else if (req.user!.role !== Role.OWNER && req.user!.role !== Role.MANAGER) {
    // Spec §5: soft-delete query discipline - exclude inactive by default for non-admin callers
    whereClause.isActive = true;
  }

  const users = await prisma.user.findMany({
    where: whereClause,
    select: {
      id: true,
      name: true,
      role: true,
      email: true,
      phone: true,
      salaryAmount: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      loginAttempt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return res.json(users);
}

export async function createUser(req: AuthenticatedRequest, res: Response) {
  const callerRole = req.user!.role as Role;
  const { name, role, email, phone, pinCode, password, salaryAmount } = req.body;

  // Role matrix enforcement: Manager cannot create another Manager or Owner
  if (callerRole === Role.MANAGER && (role === Role.MANAGER || role === Role.OWNER)) {
    return res.status(403).json({
      error: 'Forbidden: Managers cannot create Manager or Owner accounts. Only the Owner can.',
    });
  }

  // Validate credentials based on role
  let pinSalt = null;
  let pinHash = null;
  let passHash = null;

  if (role === Role.WAITER) {
    if (!pinCode) {
      return res.status(400).json({ error: 'PIN code is required for WAITER role.' });
    }
    if (!isValidPinFormat(pinCode)) {
      return res.status(400).json({
        error: 'PIN must be exactly 4 digits and must not be a trivial sequence (e.g. 1234, 0000, 1111).',
      });
    }
    const { salt, hash } = hashPin(pinCode);
    pinSalt = salt;
    pinHash = hash;
  } else {
    if (!password) {
      return res.status(400).json({ error: 'Password is required for web roles.' });
    }
    passHash = await hashPassword(password);
  }

  // Check unique email if provided
  if (email) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(400).json({ error: 'User with this email already exists.' });
    }
  }

  const newUser = await prisma.user.create({
    data: {
      name,
      role,
      email: email || null,
      phone,
      passwordHash: passHash,
      pinCodeHash: pinHash,
      pinSalt: pinSalt,
      salaryAmount: salaryAmount ? Math.round(parseFloat(salaryAmount) * 100) : 0,
    },
    select: {
      id: true,
      name: true,
      role: true,
      email: true,
      phone: true,
      salaryAmount: true,
      isActive: true,
      createdAt: true,
    },
  });

  await recordAudit({
    actorId: req.user!.userId,
    actionType: 'USER_CREATED',
    targetType: 'User',
    targetId: newUser.id,
    details: { name: newUser.name, role: newUser.role },
  });

  return res.status(201).json(newUser);
}

export async function updateUser(req: AuthenticatedRequest, res: Response) {
  const callerRole = req.user!.role as Role;
  const { id } = req.params;

  const targetUser = await prisma.user.findUnique({ where: { id } });
  if (!targetUser) {
    return res.status(404).json({ error: 'User not found.' });
  }

  // Manager cannot edit Manager or Owner
  if (callerRole === Role.MANAGER && (targetUser.role === Role.MANAGER || targetUser.role === Role.OWNER)) {
    return res.status(403).json({ error: 'Forbidden: Managers cannot modify Manager or Owner profiles.' });
  }

  const updatedUser = await prisma.user.update({
    where: { id },
    data: {
      ...req.body,
      ...(req.body.salaryAmount !== undefined && { salaryAmount: Math.round(parseFloat(req.body.salaryAmount) * 100) })
    },
    select: {
      id: true,
      name: true,
      role: true,
      email: true,
      phone: true,
      salaryAmount: true,
      isActive: true,
      updatedAt: true,
    },
  });

  await recordAudit({
    actorId: req.user!.userId,
    actionType: 'USER_UPDATED',
    targetType: 'User',
    targetId: id,
    details: { changes: req.body },
  });

  return res.json(updatedUser);
}

export async function deactivateUser(req: AuthenticatedRequest, res: Response) {
  const callerRole = req.user!.role as Role;
  const { id } = req.params;

  const targetUser = await prisma.user.findUnique({ where: { id } });
  if (!targetUser) {
    return res.status(404).json({ error: 'User not found.' });
  }

  if (callerRole === Role.MANAGER && (targetUser.role === Role.MANAGER || targetUser.role === Role.OWNER)) {
    return res.status(403).json({ error: 'Forbidden: Managers cannot deactivate Manager or Owner accounts.' });
  }

  const updated = await prisma.user.update({
    where: { id },
    data: { isActive: false },
    select: { id: true, name: true, isActive: true },
  });

  await recordAudit({
    actorId: req.user!.userId,
    actionType: 'USER_DEACTIVATED',
    targetType: 'User',
    targetId: id,
    details: { name: targetUser.name },
  });

  return res.json({ message: 'Staff member deactivated successfully.', user: updated });
}

export async function resetPin(req: AuthenticatedRequest, res: Response) {
  const callerRole = req.user!.role as Role;
  const { id } = req.params;
  let { pinCode } = req.body;

  const targetUser = await prisma.user.findUnique({ where: { id } });
  if (!targetUser) {
    return res.status(404).json({ error: 'User not found.' });
  }

  if (callerRole === Role.MANAGER && (targetUser.role === Role.MANAGER || targetUser.role === Role.OWNER)) {
    return res.status(403).json({ error: 'Forbidden: Managers cannot reset PIN for Manager or Owner accounts.' });
  }

  // Auto-generate a valid PIN if none was supplied by caller
  if (!pinCode) {
    pinCode = crypto.randomInt(0, 10000).toString().padStart(4, '0');
    // Ensure it's not a trivial PIN
    while (!isValidPinFormat(pinCode)) {
      pinCode = crypto.randomInt(0, 10000).toString().padStart(4, '0');
    }
  }

  if (!isValidPinFormat(pinCode)) {
    return res.status(400).json({
      error: 'PIN must be exactly 4 digits and must not be a trivial sequence (e.g. 1234, 0000, 1111).',
    });
  }

  const { salt, hash } = hashPin(pinCode);

  await prisma.user.update({
    where: { id },
    data: { pinCodeHash: hash, pinSalt: salt },
  });

  await prisma.loginAttempt.deleteMany({ where: { userId: id } });
  await prisma.refreshToken.deleteMany({ where: { userId: id } }); // Revoke sessions

  return res.json({ message: `PIN reset successfully for staff member ${targetUser.name}.`, pin: pinCode });
}

export async function resetPassword(req: AuthenticatedRequest, res: Response) {
  const callerRole = req.user!.role as Role;
  const { id } = req.params;
  let { password } = req.body;

  const targetUser = await prisma.user.findUnique({ where: { id } });
  if (!targetUser) {
    return res.status(404).json({ error: 'User not found.' });
  }

  if (callerRole === Role.MANAGER && (targetUser.role === Role.MANAGER || targetUser.role === Role.OWNER)) {
    return res.status(403).json({ error: 'Forbidden: Managers cannot reset password for Manager or Owner accounts.' });
  }

  // Auto-generate a temporary password if none supplied
  if (!password) {
    password = crypto.randomBytes(8).toString('hex');
  }

  const hash = await hashPassword(password);

  await prisma.user.update({
    where: { id },
    data: { passwordHash: hash },
  });

  await prisma.loginAttempt.deleteMany({ where: { userId: id } });
  await prisma.refreshToken.deleteMany({ where: { userId: id } }); // Revoke sessions

  return res.json({ message: `Password reset successfully for staff member ${targetUser.name}.`, password });
}

export async function unlockUser(req: AuthenticatedRequest, res: Response) {
  const callerRole = req.user!.role as Role;
  const { id } = req.params;

  const targetUser = await prisma.user.findUnique({ where: { id } });
  if (!targetUser) {
    return res.status(404).json({ error: 'User not found.' });
  }

  if (callerRole === Role.MANAGER && (targetUser.role === Role.MANAGER || targetUser.role === Role.OWNER)) {
    return res.status(403).json({ error: 'Forbidden: Managers cannot unlock Manager or Owner accounts.' });
  }

  await prisma.loginAttempt.deleteMany({
    where: { userId: id },
  });

  return res.json({ message: `Staff member ${targetUser.name} has been unlocked successfully.` });
}

export async function getMe(req: AuthenticatedRequest, res: Response) {
  const userId = req.user!.userId;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      role: true,
      email: true,
      phone: true,
      salaryAmount: true,
      isActive: true,
      preferredLanguage: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!user || !user.isActive) {
    return res.status(404).json({ error: 'User not found.' });
  }

  return res.json(user);
}

export async function changeOwnPassword(req: AuthenticatedRequest, res: Response) {
  const userId = req.user!.userId;
  const { currentPassword, newPassword } = req.body;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) {
    return res.status(404).json({ error: 'User not found.' });
  }

  if (user.role === Role.WAITER) {
    return res.status(403).json({ error: 'Waiters cannot change passwords via the web app.' });
  }

  if (!user.passwordHash) {
    return res.status(400).json({ error: 'No password is set for this account.' });
  }

  const isValid = await comparePassword(currentPassword, user.passwordHash);
  if (!isValid) {
    return res.status(401).json({ error: 'Current password is incorrect.' });
  }

  const passHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: passHash },
  });

  return res.json({ message: 'Password updated successfully.' });
}

export async function changeLanguage(req: AuthenticatedRequest, res: Response) {
  const userId = req.user!.userId;
  const { preferredLanguage } = req.body;

  if (!['en', 'am'].includes(preferredLanguage)) {
    return res.status(400).json({ error: 'Invalid language preference.' });
  }

  await prisma.user.update({
    where: { id: userId },
    data: { preferredLanguage },
  });

  return res.json({ message: 'Language preference updated.' });
}
