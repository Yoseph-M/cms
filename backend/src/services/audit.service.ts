import { prisma } from './prisma.service';
import { logger } from '../utils/logger';
import { Prisma } from '@prisma/client';

export interface AuditEntryInput {
  actorId: string;
  actionType: string;
  targetType: string;
  targetId?: string;
  details?: Record<string, unknown>;
}

/**
 * Persists a structured audit event to the AuditLog collection.
 * Fire-and-forget — failures are logged but never block the caller.
 */
export async function recordAudit(entry: AuditEntryInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: entry.actorId,
        actionType: entry.actionType,
        targetType: entry.targetType,
        targetId: entry.targetId,
        details: (entry.details ?? {}) as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    logger.error({ err, entry }, 'Failed to persist audit log entry.');
  }
}
