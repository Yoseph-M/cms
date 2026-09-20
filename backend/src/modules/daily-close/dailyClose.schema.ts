import { z } from 'zod';

export const startDailyCloseSchema = z.object({
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
});

/**
 * Approving or disapproving a close request carries no money fields: the manager
 * is judging the day, not counting the drawer. The optional note is kept for the
 * reason behind a disapproval.
 */
export const reviewDailyCloseSchema = z.object({
  reviewNotes: z.string().optional(),
});

/** @deprecated use reviewDailyCloseSchema — kept so old imports keep compiling. */
export const finalizeDailyCloseSchema = reviewDailyCloseSchema;
