import { z } from 'zod';
import { VarianceReviewStatus } from '@prisma/client';

export const reviewVarianceSchema = z.object({
  status: z.enum([VarianceReviewStatus.APPROVED, VarianceReviewStatus.REJECTED]),
  managerNotes: z.string().min(1, 'Manager notes are required for variance review'),
});
