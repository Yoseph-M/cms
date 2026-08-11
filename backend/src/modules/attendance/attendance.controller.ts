import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { prisma } from '../../services/prisma.service';
import { recordAudit } from '../../services/audit.service';
import { createNotification } from '../../services/notification.service';
import { Role } from '@prisma/client';

export async function getAttendance(req: AuthenticatedRequest, res: Response) {
  const { userId, startDate, endDate, month, year } = req.query;
  const callerRole = req.user!.role as Role;

  const whereClause: Record<string, unknown> = {};

  if (userId) whereClause.userId = userId as string;

  if (month && year) {
    const m = parseInt(month as string, 10);
    const y = parseInt(year as string, 10);
    whereClause.date = {
      gte: `${y}-${String(m).padStart(2, '0')}-01`,
      lte: `${y}-${String(m).padStart(2, '0')}-31`,
    };
  } else if (startDate && endDate) {
    whereClause.date = {
      gte: startDate as string,
      lte: endDate as string,
    };
  }

  // MongoDB does not enforce relations. Older data can therefore contain an
  // attendance row whose staff account was removed. `include: { user: ... }`
  // makes Prisma throw for the whole result set in that case. Fetch the two
  // collections explicitly and omit only those orphaned legacy rows.
  const rawRecords = await prisma.attendance.findMany({
    where: whereClause,
    orderBy: { date: 'desc' },
  });
  const userIds = [...new Set(rawRecords.map((record) => record.userId))];
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, role: true },
      })
    : [];
  const usersById = new Map(users.map((user) => [user.id, user]));
  const records = rawRecords.flatMap((record) => {
    const user = usersById.get(record.userId);
    return user ? [{ ...record, user }] : [];
  });

  // Manager scope: exclude Owner/Manager attendance rows from response
  if (callerRole === Role.MANAGER) {
    const scoped = records.filter(
      (r) => r.user.role !== Role.OWNER && r.user.role !== Role.MANAGER
    );
    return res.json(scoped);
  }

  return res.json(records);
}

export async function createOrUpdateAttendance(req: AuthenticatedRequest, res: Response) {
  const { userId, date, status, note } = req.body;
  const actorId = req.user!.userId;
  const callerRole = req.user!.role as Role;
  const todayLocal = new Date().toISOString().split('T')[0];

  const targetUser = await prisma.user.findUnique({ where: { id: userId } });
  if (!targetUser) {
    return res.status(404).json({ error: 'User not found.' });
  }

  // OWNER: reject unless ownerCanEditAttendance is enabled
  if (callerRole === Role.OWNER) {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: 'ownerCanEditAttendance' },
    });
    if (setting?.value !== 'true') {
      return res.status(403).json({
        error: 'Owner attendance editing is disabled. Enable it in Settings → Attendance.',
      });
    }
  }

  // MANAGER: only allowed to create for today's date
  if (callerRole === Role.MANAGER && date !== todayLocal) {
    return res.status(403).json({ error: 'Attendance can only be recorded for today.' });
  }

  // Check for existing record — block SYSTEM_LOGIN entries from being modified
  const existing = await prisma.attendance.findUnique({
    where: { userId_date: { userId, date } },
  });
  if (existing?.source === 'SYSTEM_LOGIN') {
    return res.status(403).json({
      error: 'This entry was recorded automatically at login and cannot be edited.',
    });
  }

  // Owner override of an existing day requires a note
  if (existing && callerRole === Role.OWNER && !note?.trim()) {
    return res.status(400).json({ error: 'A note is required when overriding an existing attendance record.' });
  }

  const record = await prisma.attendance.upsert({
    where: {
      userId_date: { userId, date },
    },
    update: {
      status,
      note: note || '',
    },
    create: {
      userId,
      date,
      status,
      source: 'MANUAL',
      note: note || '',
    },
    include: {
      user: { select: { id: true, name: true, role: true } },
    },
  });

  await recordAudit({
    actorId,
    actionType: existing ? 'ATTENDANCE_UPDATED' : 'ATTENDANCE_LOGGED',
    targetType: 'Attendance',
    targetId: record.id,
    details: {
      userId,
      date,
      status,
      note: note || '',
      previousStatus: existing?.status,
      isOverride: !!existing,
    },
  });

  if (existing && callerRole === Role.OWNER) {
    await createNotification({
      type: 'SYSTEM_OVERRIDE',
      severity: 'info',
      message: `Owner overrode attendance for ${targetUser.name} on ${date}: ${existing.status} → ${status}.`,
      relatedId: record.id,
    });
  }

  return res.status(201).json(record);
}

export async function updateAttendance(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const { status, note } = req.body;
  const actorId = req.user!.userId;
  const callerRole = req.user!.role as Role;
  const todayLocal = new Date().toISOString().split('T')[0];

  const before = await prisma.attendance.findUnique({ where: { id } });
  if (!before) {
    return res.status(404).json({ error: 'Attendance record not found.' });
  }

  // SYSTEM_LOGIN records are permanently immutable — no role can edit them
  if (before.source === 'SYSTEM_LOGIN') {
    return res.status(403).json({
      error: 'This entry was recorded automatically at login and cannot be edited.',
    });
  }

  // OWNER: reject unless ownerCanEditAttendance is enabled
  if (callerRole === Role.OWNER) {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: 'ownerCanEditAttendance' },
    });
    if (setting?.value !== 'true') {
      return res.status(403).json({
        error: 'Owner attendance editing is disabled. Enable it in Settings → Attendance.',
      });
    }
    // Owner requires reason for history edits
    if (!note?.trim()) {
      return res.status(400).json({
        error: 'A reason is required when overriding an existing attendance entry.',
      });
    }
  }

  // MANAGER: only allowed to edit today's records
  if (callerRole === Role.MANAGER && before.date !== todayLocal) {
    return res.status(403).json({ error: 'Attendance can only be edited for today.' });
  }

  const updated = await prisma.attendance.update({
    where: { id },
    data: { status, note: note || '' },
    include: {
      user: { select: { id: true, name: true, role: true } },
    },
  });

  await recordAudit({
    actorId,
    actionType: 'ATTENDANCE_OVERRIDE',
    targetType: 'Attendance',
    targetId: id,
    details: {
      userId: before.userId,
      date: before.date,
      fromStatus: before.status,
      toStatus: status,
      note: note || '',
    },
  });

  if (callerRole === Role.OWNER) {
    await createNotification({
      type: 'SYSTEM_OVERRIDE',
      severity: 'info',
      message: `Owner overrode attendance on ${before.date}: ${before.status} → ${status}${note ? ` (${note})` : ''}`,
      relatedId: id,
    });
  }

  return res.json(updated);
}
