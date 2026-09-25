import { prisma } from './prisma.service';
import { logger } from '../utils/logger';

/**
 * Reminder pause.
 *
 * The scheduled reminder checks (missing attendance, payroll period due, stale
 * menu items) are derived from data a system reset deliberately *keeps* — staff
 * accounts, the menu and settings. That means a reset could never look like a
 * reset: the inbox was emptied, and the next scheduler pass (within five
 * minutes) refilled it with one "no attendance marked" alert per staff member.
 * The operator resets, opens the dashboard, and sees the same eleven unread
 * alerts they were trying to clear.
 *
 * So a destructive reset records a pause. While it is in force the reminder
 * checks stand down; the money-safety job (auto-cancelling stale open tickets)
 * keeps running, because that one protects the books rather than pointing at
 * people. The pause ends at the operator's next local midnight, which is also
 * when these reminders stop being about the day that was just wiped.
 */

/** Setting row that records when reminders may start again (ISO 8601). */
export const REMINDER_PAUSE_KEY = 'notifications.remindersPausedUntil';

/** The next local midnight — end of the operator's current day. */
export function endOfToday(now: Date = new Date()): Date {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return end;
}

/**
 * Silence the scheduled reminders until `until` (defaults to end of today).
 * Returns the ISO timestamp so the caller can report it to the operator.
 */
export async function pauseReminders(until: Date = endOfToday()): Promise<string> {
  const iso = until.toISOString();
  await prisma.systemSetting.upsert({
    where: { key: REMINDER_PAUSE_KEY },
    update: { value: iso },
    create: { key: REMINDER_PAUSE_KEY, value: iso },
  });
  logger.info({ until: iso }, 'Scheduled reminders paused.');
  return iso;
}

/**
 * The pause currently in force, or null when reminders may run. An expired (or
 * unparseable) value is reported as null — the caller never has to compare
 * timestamps itself.
 */
export async function getReminderPause(now: Date = new Date()): Promise<Date | null> {
  const row = await prisma.systemSetting.findUnique({ where: { key: REMINDER_PAUSE_KEY } });
  if (!row?.value) return null;
  const until = new Date(row.value);
  if (Number.isNaN(until.getTime()) || until <= now) return null;
  return until;
}

/** Clear the pause (not exposed in the UI — it expires on its own). */
export async function resumeReminders(): Promise<void> {
  await prisma.systemSetting.deleteMany({ where: { key: REMINDER_PAUSE_KEY } });
}
