import { prisma } from './prisma.service';
import { createNotification } from './notification.service';
import { emitToLiveOrders } from './socket.service';
import { recordAudit, SYSTEM_USER_ID } from './audit.service';
import { Role, OrderStatus, SettlementStatus, PaymentMethod } from '@prisma/client';
import { logger } from '../utils/logger';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Active staff expected to have attendance (excludes Owner). */
async function checkMissingAttendance() {
  const date = todayYmd();
  const staff = await prisma.user.findMany({
    where: { isActive: true, role: { not: Role.OWNER } },
    select: { id: true, name: true, role: true },
  });

  for (const user of staff) {
    const record = await prisma.attendance.findUnique({
      where: { userId_date: { userId: user.id, date } },
    });
    if (record) continue;

    const already = await prisma.notification.findFirst({
      where: {
        type: 'MISSING_ATTENDANCE',
        relatedId: user.id,
        createdAt: { gte: new Date(Date.now() - DAY_MS) },
      },
    });
    if (already) continue;

    // Format date in a more readable way
    const dateObj = new Date(date);
    const formattedDate = dateObj.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });

    await createNotification({
      type: 'MISSING_ATTENDANCE',
      severity: 'warning',
      message: `${user.name} has no attendance marked for ${formattedDate}. Tap to mark it.`,
      relatedId: user.id,
    });
  }
}

async function checkPayrollPeriodDue() {
  const now = new Date();
  // Reminder in the last 5 days of the month
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  if (now.getDate() < lastDay - 4) return;

  const periodMonth = now.getMonth() + 1;
  const periodYear = now.getFullYear();
  
  // Format month name for better readability
  const monthName = now.toLocaleDateString('en-US', { month: 'long' });

  const staff = await prisma.user.findMany({
    where: { isActive: true, role: { not: Role.OWNER } },
    select: { id: true, name: true },
  });

  for (const user of staff) {
    const paid = await prisma.userPayment.findUnique({
      where: {
        userId_periodMonth_periodYear: {
          userId: user.id,
          periodMonth,
          periodYear,
        },
      },
    });
    if (paid) continue;

    const already = await prisma.notification.findFirst({
      where: {
        type: 'PAYROLL_PERIOD_DUE',
        relatedId: user.id,
        createdAt: { gte: new Date(Date.now() - 3 * DAY_MS) },
      },
    });
    if (already) continue;

    await createNotification({
      type: 'PAYROLL_PERIOD_DUE',
      severity: 'info',
      message: `${user.name}'s ${monthName} ${periodYear} salary hasn't been recorded yet.`,
      relatedId: user.id,
    });
  }
}

async function checkUnavailableMenuItems() {
  const cutoff = new Date(Date.now() - 7 * DAY_MS);
  const items = await prisma.menuItem.findMany({
    where: { isAvailable: false, updatedAt: { lte: cutoff } },
  });

  for (const item of items) {
    const already = await prisma.notification.findFirst({
      where: {
        type: 'MENU_ITEM_UNAVAILABLE',
        relatedId: item.id,
        createdAt: { gte: new Date(Date.now() - 7 * DAY_MS) },
      },
    });
    if (already) continue;

    await createNotification({
      type: 'MENU_ITEM_UNAVAILABLE',
      severity: 'info',
      message: `${item.name} has been off the menu for over a week. Make it available again, or remove it.`,
      relatedId: item.id,
    });
  }
}

/**
 * Stuck / failed kitchen tickets are owned by the print dispatch service, which
 * alerts within ~3 minutes and marks the job FAILED after ~10 — see
 * `print-dispatch.service.ts`.
 */

/** Open orders with no settlement inside this window are auto-cancelled. */
export const AUTO_CANCEL_WINDOW_HOURS = 3;

const AUTO_CANCEL_REASON = `Auto-cancelled: no settlement received within ${AUTO_CANCEL_WINDOW_HOURS} hours`;

export async function autoCancelStaleOrders() {
  const staleCutoff = new Date(Date.now() - AUTO_CANCEL_WINDOW_HOURS * HOUR_MS);
  
  const staleOrders = await prisma.order.findMany({
    where: {
      status: { notIn: [OrderStatus.PAID, OrderStatus.CANCELLED] },
      settlementStatus: { not: SettlementStatus.SETTLED },
      createdAt: { lt: staleCutoff }
    },
    include: {
      waiter: { select: { id: true, name: true } },
      cashier: { select: { id: true, name: true } },
      cancelledBy: { select: { id: true, name: true } },
    }
  });

  for (const order of staleOrders) {
    // Only cancel if no partial settlements exist (too complex to auto-refund)
    if (order.settlementStatus === SettlementStatus.PARTIALLY_SETTLED) {
      continue;
    }

    try {
      const updated = await prisma.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.CANCELLED,
          cancellationReason: AUTO_CANCEL_REASON,
        },
        include: {
          waiter: { select: { id: true, name: true } },
          cashier: { select: { id: true, name: true } },
          cancelledBy: { select: { id: true, name: true } },
        }
      });
      
      await recordAudit({
        actorId: SYSTEM_USER_ID,
        actionType: 'ORDER_CANCELLED',
        targetType: 'Order',
        targetId: order.id,
        details: { reason: AUTO_CANCEL_REASON, note: 'System background job' },
      });

      // Record a void settlement so the auto-cancellation shows up in the
      // settlement history alongside manual cancellations. Non-critical: the
      // cancellation itself has already succeeded either way.
      try {
        const alreadyLogged = await prisma.settlement.findFirst({
          where: { orderId: order.id, reference: 'VOID' },
          select: { id: true },
        });
        // Attribute the void record to a real user (the cashier or waiter on
        // the order) — settlements carry a required relation to User.
        const recordedById = order.cashierId ?? order.waiterId;
        if (!alreadyLogged && recordedById) {
          await prisma.settlement.create({
            data: {
              orderId: order.id,
              amountMinor: Math.max(order.totalAmount, 0),
              method: PaymentMethod.NONE,
              reference: 'VOID',
              note: AUTO_CANCEL_REASON,
              recordedById,
            },
          });
        }
      } catch (settlementErr) {
        logger.warn({ err: settlementErr, orderId: order.id }, 'Failed to record void settlement for auto-cancelled order');
      }

      emitToLiveOrders('order:cancelled', updated as any);
      logger.info({ orderId: order.id }, 'Auto-cancelled stale order');
    } catch (err) {
      logger.error({ err, orderId: order.id }, 'Failed to auto-cancel stale order');
    }
  }
}

export async function runScheduledNotificationChecks() {
  try {
    await checkMissingAttendance();
    await checkPayrollPeriodDue();
    await checkUnavailableMenuItems();
    await autoCancelStaleOrders();
  } catch (err) {
    logger.error({ err }, 'Scheduled notification checks failed');
  }
}

/** Start lightweight interval jobs (no external cron dependency). */
export function startNotificationScheduler() {
  // Run shortly after boot, then every 5 minutes
  setTimeout(() => {
    void runScheduledNotificationChecks();
  }, 15_000);

  setInterval(() => {
    void runScheduledNotificationChecks();
  }, 5 * 60 * 1000);

  logger.info('Notification scheduler started (5-minute interval checks)');
}
