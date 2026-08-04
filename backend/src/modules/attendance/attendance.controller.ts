import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { prisma } from '../../services/prisma.service';

export async function getAttendance(req: AuthenticatedRequest, res: Response) {
  const { userId, startDate, endDate } = req.query;

  const whereClause: any = {};
  if (userId) whereClause.userId = userId as string;
  if (startDate && endDate) {
    whereClause.date = {
      gte: startDate as string,
      lte: endDate as string,
    };
  }

  const records = await prisma.attendance.findMany({
    where: whereClause,
    include: {
      user: { select: { id: true, name: true, role: true } },
    },
    orderBy: { date: 'desc' },
  });

  return res.json(records);
}

export async function createOrUpdateAttendance(req: AuthenticatedRequest, res: Response) {
  const { userId, date, status, note } = req.body;

  // Upsert on unique compound index [userId, date]
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

  return res.status(201).json(record);
}

export async function updateAttendance(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const { status, note } = req.body;

  const updated = await prisma.attendance.update({
    where: { id },
    data: { status, note },
    include: {
      user: { select: { id: true, name: true, role: true } },
    },
  });

  return res.json(updated);
}
