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

  const targetUser = await prisma.user.findUnique({ where: { id: userId } });
  if (!targetUser) {
    return res.status(404).json({ error: 'User not found.' });
  }

  // Owner override of an existing day requires a note
  const existing = await prisma.attendance.findUnique({
    where: { userId_date: { userId, date } },
  });
  if (existing && callerRole === Role.OWNER && !note) {
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

  const before = await prisma.attendance.findUnique({ where: { id } });
  if (!before) {
    return res.status(404).json({ error: 'Attendance record not found.' });
  }

  // Owner override requires a reason when editing an existing entry
  if (callerRole === Role.OWNER && !note?.trim()) {
    return res.status(400).json({
      error: 'A reason is required when overriding an existing attendance entry.',
    });
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
