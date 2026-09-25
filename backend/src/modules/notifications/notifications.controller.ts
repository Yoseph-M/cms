import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { prisma } from '../../services/prisma.service';
import { Role } from '@prisma/client';
import { withRetry } from '../../utils/retry';

export async function listNotifications(req: AuthenticatedRequest, res: Response) {
  const unreadOnly = req.query.unreadOnly === 'true' || req.query.unreadOnly === '1';
  const role = req.user!.role as Role;

  // Broadcast notifications (no recipientRole) + role-targeted ones.
  // Fetch recent and filter in-process — Mongo null equality on optional enums is unreliable.
  const recent = await withRetry(
    () =>
      prisma.notification.findMany({
        where: unreadOnly ? { isRead: false } : undefined,
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    { label: 'listNotifications' },
  );

  const notifications = recent
    .filter((n) => !n.recipientRole || n.recipientRole === role)
    .slice(0, 100);

  return res.json(notifications);
}

export async function markRead(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const existing = await withRetry(
    () => prisma.notification.findUnique({ where: { id } }),
    { label: 'markRead.find' },
  );
  if (!existing) {
    return res.status(404).json({ error: 'Notification not found.' });
  }

  const updated = await withRetry(
    () =>
      prisma.notification.update({
        where: { id },
        data: { isRead: true },
      }),
    { label: 'markRead.update' },
  );
  return res.json(updated);
}

export async function markAllRead(req: AuthenticatedRequest, res: Response) {
  const role = req.user!.role as Role;
  const result = await withRetry(
    () =>
      prisma.notification.updateMany({
        where: {
          isRead: false,
          OR: [{ recipientRole: null }, { recipientRole: role }],
        },
        data: { isRead: true },
      }),
    { label: 'markAllRead' },
  );
  return res.json({ updated: result.count });
}
