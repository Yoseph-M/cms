import { NotificationType, Role } from '@prisma/client';
import { prisma } from './prisma.service';
import { emitToLiveOrders } from './socket.service';

export interface CreateNotificationInput {
  type: NotificationType | keyof typeof NotificationType;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  recipientRole?: Role | null;
  relatedId?: string | null;
}

export async function createNotification(input: CreateNotificationInput) {
  const notification = await prisma.notification.create({
    data: {
      type: input.type as NotificationType,
      message: input.message,
      severity: input.severity,
      recipientRole: input.recipientRole ?? null,
      relatedId: input.relatedId ?? null,
    },
  });

  emitToLiveOrders('notification:new', notification);
  return notification;
}
