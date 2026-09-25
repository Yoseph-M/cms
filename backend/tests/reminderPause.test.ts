/**
 * Reminder pause after a destructive reset.
 *
 * The scheduled reminders are derived from data a reset *keeps* (staff, menu,
 * settings), so an emptied inbox refilled within one scheduler pass and the
 * reset looked like it had done nothing. These tests pin both halves of the
 * fix: the reset records a pause, and the pause silences the "someone is
 * missing something" reminders without touching the stale-ticket sweep that
 * protects the books.
 */
import { OrderStatus, Role, SettlementStatus } from '@prisma/client';
import { cleanDb, disconnectPrisma, getPrisma, seedTestUser } from './helpers';
import * as factories from './factories';
import { resetBusinessData } from '../src/modules/backup/backup.service';
import { AUTO_CANCEL_WINDOW_HOURS, runScheduledNotificationChecks } from '../src/services/notification.scheduler';
import {
  REMINDER_PAUSE_KEY,
  endOfToday,
  getReminderPause,
  pauseReminders,
  resumeReminders,
} from '../src/services/reminder-pause.service';

beforeEach(async () => {
  await cleanDb();
});

afterAll(async () => {
  await disconnectPrisma();
});

describe('endOfToday', () => {
  it('is the last millisecond of the local day', () => {
    const end = endOfToday(new Date('2026-09-24T08:30:00'));

    expect(end.getFullYear()).toBe(2026);
    expect(end.getMonth()).toBe(8); // September
    expect(end.getDate()).toBe(24);
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
    expect(end.getSeconds()).toBe(59);
    expect(end.getMilliseconds()).toBe(999);
  });
});

describe('reminder pause', () => {
  it('a reset pauses the reminders it would otherwise regenerate', async () => {
    const prisma = getPrisma();
    // Two active staff with nothing marked today — exactly what the attendance
    // reminder job looks for.
    await seedTestUser({ role: Role.CASHIER, username: 'pause-cashier' });
    await seedTestUser({ role: Role.WAITER, username: 'pause-waiter' });

    const result = await resetBusinessData();

    expect(result.remindersPausedUntil).toBeTruthy();
    expect(await getReminderPause()).not.toBeNull();
    const row = await prisma.systemSetting.findUnique({ where: { key: REMINDER_PAUSE_KEY } });
    expect(row?.value).toBe(result.remindersPausedUntil);

    // A scheduler pass right after the reset must not refill the inbox.
    await runScheduledNotificationChecks();
    expect(await prisma.notification.count()).toBe(0);
  });

  it('stops reminding again once the pause has expired', async () => {
    const prisma = getPrisma();
    await seedTestUser({ role: Role.CASHIER, username: 'resume-cashier' });
    await seedTestUser({ role: Role.WAITER, username: 'resume-waiter' });

    // A pause in the past is not in force — no reset needed to prove it.
    await pauseReminders(new Date(Date.now() - 60_000));
    expect(await getReminderPause()).toBeNull();

    await runScheduledNotificationChecks();

    const reminders = await prisma.notification.findMany({ where: { type: 'MISSING_ATTENDANCE' } });
    expect(reminders).toHaveLength(2);
  });

  it('leaves the stale-ticket sweep running while reminders are paused', async () => {
    const prisma = getPrisma();
    const waiter = await seedTestUser({ role: Role.WAITER, username: 'pause-stale-waiter' });
    const stale = await factories.createOrder(
      { prisma },
      { waiterId: waiter.id, status: OrderStatus.SUBMITTED, settlementStatus: SettlementStatus.UNSETTLED, totalAmount: 900 },
    );
    // Older than the auto-cancel window, so the sweep has to pick it up.
    await prisma.order.update({
      where: { id: stale.id },
      data: { createdAt: new Date(Date.now() - (AUTO_CANCEL_WINDOW_HOURS + 1) * 60 * 60 * 1000) },
    });

    await pauseReminders();
    await runScheduledNotificationChecks();

    const after = await prisma.order.findUnique({ where: { id: stale.id } });
    expect(after?.status).toBe(OrderStatus.CANCELLED);
    // ...and the pause did suppress the attendance reminder for that waiter.
    expect(await prisma.notification.count({ where: { type: 'MISSING_ATTENDANCE' } })).toBe(0);
  });

  it('clears the pause explicitly and tolerates a garbage value', async () => {
    const prisma = getPrisma();
    await pauseReminders();
    expect(await getReminderPause()).not.toBeNull();

    await resumeReminders();
    expect(await getReminderPause()).toBeNull();

    await prisma.systemSetting.upsert({
      where: { key: REMINDER_PAUSE_KEY },
      update: { value: 'not-a-date' },
      create: { key: REMINDER_PAUSE_KEY, value: 'not-a-date' },
    });
    // An unreadable value must never wedge the scheduler off forever.
    expect(await getReminderPause()).toBeNull();
  });
});
