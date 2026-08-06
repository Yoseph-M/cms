import { prisma } from './prisma.service';
import { createNotification } from './notification.service';
import { Role } from '@prisma/client';
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

    await createNotification({
      type: 'MISSING_ATTENDANCE',
      severity: 'warning',
      message: `No attendance recorded for ${user.name} (${user.role}) on ${date}.`,
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
      message: `No payroll entry recorded yet for ${user.name} for ${periodMonth}/${periodYear}.`,
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
      message: `"${item.name}" has been unavailable for over 7 days. Consider re-enabling it.`,
      relatedId: item.id,
    });
  }
}

export async function runScheduledNotificationChecks() {
  try {
    await checkMissingAttendance();
    await checkPayrollPeriodDue();
    await checkUnavailableMenuItems();
  } catch (err) {
    logger.error({ err }, 'Scheduled notification checks failed');
  }
}

/** Start lightweight interval jobs (no external cron dependency). */
export function startNotificationScheduler() {
  // Run shortly after boot, then every hour
  setTimeout(() => {
    void runScheduledNotificationChecks();
  }, 15_000);

  setInterval(() => {
    void runScheduledNotificationChecks();
  }, HOUR_MS);

  logger.info('Notification scheduler started (hourly checks)');
}
