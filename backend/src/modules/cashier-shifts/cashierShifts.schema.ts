import { z } from 'zod';

// ---------- Cashier Shift Schemas ----------

// Self-service shift open (cashierId determined by server from auth)
export const openShiftSchema = z.object({
  openingCashMinor: z.number().int('Opening cash must be an integer (minor units)').nonnegative('Opening cash cannot be negative'),
});

// Administrative shift open (cashierId required for manager/owner)
export const openShiftAdminSchema = z.object({
  cashierId: z.string().min(1, 'cashierId is required for administrative shift opening'),
  openingCashMinor: z.number().int('Opening cash must be an integer (minor units)').nonnegative('Opening cash cannot be negative'),
});

export const closeShiftSchema = z.object({
  declaredCashMinor: z.number().int('Declared cash must be an integer (minor units)').nonnegative('Declared cash cannot be negative'),
  notes: z.string().optional(),
  reason: z.string().optional(), // Required if variance != 0; enforced in service
});

export const cashDrawerEventSchema = z.object({
  type: z.enum(['CASH_PAYOUT', 'PETTY_CASH', 'CASH_ADJUSTMENT']),
  amountMinor: z.number().int('Amount must be an integer (minor units)'),
  notes: z.string().optional(),
});
