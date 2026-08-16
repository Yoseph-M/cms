import { z } from 'zod';

export const runIntegrityCheckSchema = z.object({
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
});
