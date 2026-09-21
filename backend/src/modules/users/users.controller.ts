import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { prisma } from '../../services/prisma.service';
import { comparePassword, hashPassword, hashPin } from '../../utils/security';
import { recordAudit } from '../../services/audit.service';
import { Role } from '@prisma/client';
import crypto from 'crypto';

/**
 * Person names are stored display-ready: "abebe kebede" → "Abebe Kebede".
 * Kept server-side too so an account created by any client (owner console,
 * seed script, mobile) lands in the roster with proper capitalisation.
 */
function formatPersonName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((word) =>
      word.replace(/(^|[-'’])([a-z])/g, (_match, sep: string, ch: string) => sep + ch.toUpperCase()),
    )
    .join(' ');
}

export async function getUsers(req: AuthenticatedRequest, res: Response) {
  const { role, isActive } = req.query;

  const callerRole = req.user!.role as Role;
  const isOwner = callerRole === Role.OWNER;
  const isManager = callerRole === Role.MANAGER;

  const whereClause: any = {};

  // Managers only ever see the staff who work under them — never owners or
  // other managers. Requesting those roles explicitly yields an empty list.
  // An unfiltered request (the staff / attendance roster) must NOT be empty:
  // it is scoped to "everyone below me" by the branch below.
  if (isManager && role && (role === Role.MANAGER || role === Role.OWNER)) {
    return res.json([]);
  }

  if (role) {
    whereClause.role = role as Role;
  } else if (isManager) {
    whereClause.role = { notIn: [Role.OWNER, Role.MANAGER] };
  }

  const isPrivileged = isOwner || isManager;

  if (isActive !== undefined && isPrivileged) {
    whereClause.isActive = isActive === 'true';
  } else if (!isPrivileged) {
    // Non-admins can only see active users
    whereClause.isActive = true;
  }

  const users = await prisma.user.findMany({
    where: whereClause,
    select: {
      id: true,
      name: true,
      role: true,
      username: true,
      phone: true,
      salaryAmount: isPrivileged,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      loginAttempt: true,
      pinCodeHash: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  // The hash never leaves the server — the roster only needs to know whether a
  // mobile PIN is set for that person.
  return res.json(
    users.map(({ pinCodeHash, ...user }) => ({ ...user, hasPin: Boolean(pinCodeHash) })),
  );
}

export async function createUser(req: AuthenticatedRequest, res: Response) {
  const callerRole = req.user!.role as Role;
  const { name, role, phone, password, pinCode, salaryAmount } = req.body;
  // Store usernames trimmed so a stray space can never become part of the
  // account name people have to type at the login screen.
  const username: string | null = typeof req.body.username === 'string' && req.body.username.trim()
    ? req.body.username.trim()
    : null;

  // Role matrix enforcement: Manager cannot create another Manager or Owner
  if (callerRole === Role.MANAGER && (role === Role.MANAGER || role === Role.OWNER)) {
    return res.status(403).json({
      error: 'Forbidden: Managers cannot create Manager or Owner accounts. Only the Owner can.',
    });
  }

  // App-only roles sign in with a PIN in the mobile app and never get a
  // website password: no hash is created for them, so the account simply has
  // no website credential. Owner, manager and cashier work on the site and
  // must be given a real password.
  const APP_ONLY_ROLES: Role[] = [Role.WAITER, Role.COOKER, Role.BARISTA];
  const appOnly = APP_ONLY_ROLES.includes(role);
  if (!password && !appOnly) {
    return res.status(400).json({ error: 'Password is required.' });
  }

  const passHash = password ? await hashPassword(password) : null;

  // Check unique username if provided
  if (username) {
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      return res.status(400).json({ error: 'User with this username already exists.' });
    }
  }
  // `username || null` below keeps the null case in one place.

  const newUser = await prisma.user.create({
    data: {
      name: formatPersonName(name),
      role,
      username: username || null,
      phone,
      passwordHash: passHash,
      // The mobile-app PIN is optional: a cashier never needs one, and an app
      // user can be given theirs from the staff card later.
      pinCodeHash: typeof pinCode === 'string' && pinCode ? hashPin(pinCode) : null,
      salaryAmount: salaryAmount || 0, // Already in cents from frontend
    },
    select: {
      id: true,
      name: true,
      role: true,
      username: true,
      phone: true,
      salaryAmount: true,
      isActive: true,
      createdAt: true,
      pinCodeHash: true,
    },
  });

  await recordAudit({
    actorId: req.user!.userId,
    actionType: 'USER_CREATED',
    targetType: 'User',
    targetId: newUser.id,
    details: { name: newUser.name, role: newUser.role },
  });

  const { pinCodeHash, ...created } = newUser;
  return res.status(201).json({ ...created, hasPin: Boolean(pinCodeHash) });
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

  const { password, pinCode, ...profileChanges } = req.body;

  const data: Record<string, unknown> = { ...profileChanges };
  // A PIN typed on the staff card replaces the stored hash; blank keeps it.
  if (typeof pinCode === 'string' && pinCode) data.pinCodeHash = hashPin(pinCode);
  if (typeof profileChanges.name === 'string') data.name = formatPersonName(profileChanges.name);
  // salaryAmount is already in cents from the frontend
  if (profileChanges.salaryAmount !== undefined) data.salaryAmount = profileChanges.salaryAmount;
  // A password supplied from the staff edit card replaces the stored hash.
  if (password) data.passwordHash = await hashPassword(password);

  const updatedUser = await prisma.user.update({
    where: { id },
    data,
    select: {
      id: true,
      name: true,
      role: true,
      username: true,
      phone: true,
      salaryAmount: true,
      isActive: true,
      updatedAt: true,
      pinCodeHash: true,
    },
  });

  await recordAudit({
    actorId: req.user!.userId,
    actionType: 'USER_UPDATED',
    targetType: 'User',
    targetId: id,
    details: { changes: profileChanges, passwordChanged: Boolean(password), pinChanged: Boolean(pinCode) },
  });

  const { pinCodeHash: updatedPin, ...updated } = updatedUser;
  return res.json({ ...updated, hasPin: Boolean(updatedPin) });
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

  await recordAudit({
    actorId: req.user!.userId,
    actionType: 'PASSWORD_RESET',
    targetType: 'User',
    targetId: id,
    details: { name: targetUser.name },
  });

  return res.json({ message: `Password reset successfully for staff member ${targetUser.name}.`, password });
}

/**
 * Records that put an account in the business record. A user with any of these
 * must be deactivated rather than deleted — the rows reference the account by
 * id and every reader (orders, settlements, payroll, attendance) expects that
 * person to still exist.
 */
async function hasRecordedHistory(userId: string): Promise<boolean> {
  const [orders, settlements, attendance, payments, adjustments, expenses, cancellations, shifts] =
    await Promise.all([
      prisma.order.count({
        where: { OR: [{ waiterId: userId }, { cashierId: userId }, { cancelledById: userId }] },
      }),
      prisma.settlement.count({ where: { recordedById: userId } }),
      prisma.attendance.count({ where: { userId } }),
      prisma.userPayment.count({ where: { OR: [{ userId }, { processedById: userId }] } }),
      prisma.payrollAdjustment.count({ where: { processedById: userId } }),
      prisma.expense.count({ where: { recordedById: userId } }),
      prisma.orderCancellationRequest.count({
        where: { OR: [{ requestedById: userId }, { approvedById: userId }] },
      }),
      prisma.cashierShift.count({
        where: { OR: [{ cashierId: userId }, { openedById: userId }] },
      }),
    ]);

  return (
    orders + settlements + attendance + payments + adjustments + expenses + cancellations + shifts >
    0
  );
}

/**
 * Permanently remove a staff account.
 *
 * Deleting is only safe for accounts that never took part in business: no
 * orders, settlements, attendance, payroll or expenses. Anyone with history is
 * refused with a 409 so the caller (and the UI) can offer "deactivate" instead.
 * The append-only audit trail is left alone — the audit feed renders rows whose
 * actor account no longer exists.
 */
export async function deleteUser(req: AuthenticatedRequest, res: Response) {
  const callerRole = req.user!.role as Role;
  const { id } = req.params;

  if (id === req.user!.userId) {
    return res.status(400).json({ error: 'You cannot remove your own account.' });
  }

  const targetUser = await prisma.user.findUnique({ where: { id } });
  if (!targetUser) {
    return res.status(404).json({ error: 'User not found.' });
  }

  if (targetUser.role === Role.OWNER) {
    return res.status(403).json({ error: 'Forbidden: the owner account cannot be removed.' });
  }

  if (callerRole === Role.MANAGER && targetUser.role === Role.MANAGER) {
    return res.status(403).json({ error: 'Forbidden: Managers cannot remove other managers.' });
  }

  if (await hasRecordedHistory(id)) {
    return res.status(409).json({
      error: `${targetUser.name} has orders, settlements, payroll or attendance on record. Deactivate the account instead so those records stay attributed.`,
    });
  }

  // Ephemeral authentication rows follow the account out.
  await prisma.refreshToken.deleteMany({ where: { userId: id } });
  await prisma.loginAttempt.deleteMany({ where: { userId: id } });
  await prisma.loginHistory.deleteMany({ where: { userId: id } });

  await prisma.user.delete({ where: { id } });

  await recordAudit({
    actorId: req.user!.userId,
    actionType: 'USER_DELETED',
    targetType: 'User',
    targetId: id,
    details: { name: targetUser.name, role: targetUser.role },
  });

  return res.json({ message: `${targetUser.name} was removed.`, id });
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
      username: true,
      phone: true,
      avatarUrl: true,
      salaryAmount: true,
      isActive: true,
      preferredLanguage: true,
      createdAt: true,
      updatedAt: true,
      pinCodeHash: true,
    },
  });

  if (!user || !user.isActive) {
    return res.status(404).json({ error: 'User not found.' });
  }

  const { pinCodeHash, ...profile } = user;
  return res.json({ ...profile, hasPin: Boolean(pinCodeHash) });
}

export async function updateOwnProfile(req: AuthenticatedRequest, res: Response) {
  const userId = req.user!.userId;
  const { name, phone, avatarUrl } = req.body;
  // Whitespace-only names collapse to "no username"; real ones get trimmed.
  const rawUsername = req.body.username;
  const username: string | null | undefined =
    rawUsername === undefined
      ? undefined
      : typeof rawUsername === 'string' && rawUsername.trim()
        ? rawUsername.trim()
        : null;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) {
    return res.status(404).json({ error: 'User not found.' });
  }

  // Keep the username unique when the username is being changed
  if (username && username !== user.username) {
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing && existing.id !== userId) {
      return res.status(400).json({ error: 'User with this username already exists.' });
    }
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(name !== undefined && { name: formatPersonName(String(name)) }),
      ...(username !== undefined && { username: username || null }),
      ...(phone !== undefined && { phone }),
      ...(avatarUrl !== undefined && { avatarUrl: avatarUrl || null }),
    },
    select: {
      id: true,
      name: true,
      role: true,
      username: true,
      phone: true,
      avatarUrl: true,
      salaryAmount: true,
      isActive: true,
      preferredLanguage: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  await recordAudit({
    actorId: req.user!.userId,
    actionType: 'USER_UPDATED',
    targetType: 'User',
    targetId: userId,
    details: { self: true, changes: req.body },
  });

  return res.json(updatedUser);
}

export async function changeOwnPassword(req: AuthenticatedRequest, res: Response) {
  const userId = req.user!.userId;
  const { currentPassword, newPassword } = req.body;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) {
    return res.status(404).json({ error: 'User not found.' });
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
