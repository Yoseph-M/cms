import { z } from 'zod';

export const startDailyCloseSchema = z.object({
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
});

export const finalizeDailyCloseSchema = z.object({
  reviewNotes: z.string().optional(),
});
