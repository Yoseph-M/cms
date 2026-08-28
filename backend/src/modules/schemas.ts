import { z } from 'zod';
import { Role, MenuCategory, OrderStatus, PaymentMethod, AttendanceStatus } from '@prisma/client';

// ---------- Auth Schemas ----------
export const loginSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(1, 'Password is required'),
});

export const refreshTokenSchema = z.object({
  // Prefer the HttpOnly cookie; body is ignored (kept for schema compat)
  refreshToken: z.string().optional(),
});

// ---------- User / Staff Schemas ----------
export const createUserSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  role: z.nativeEnum(Role),
  email: z.string().email().optional().nullable(),
  phone: z.string().min(5, 'Valid phone number is required'),
  password: z.string().min(6, 'Password must be at least 6 characters').optional(),
  salaryAmount: z.number().int('Salary must be an integer (cents)').nonnegative().default(0),
});

export const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  role: z.nativeEnum(Role).optional(),
  email: z.string().email().optional().nullable(),
  phone: z.string().min(5).optional(),
  salaryAmount: z.number().nonnegative().optional(),
  isActive: z.boolean().optional(),
});

export const resetPasswordSchema = z.object({
  password: z.string().min(6, 'Password must be at least 6 characters').optional(),
});

export const changeOwnPasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters'),
});

/** User-generated avatar — same constraints as menu images (data URL or http(s) URL). */
const avatarUrlSchema = z
  .string()
  .max(3_500_000, 'Image is too large (max ~2.5MB)')
  .refine(
    (v) => /^data:image\//i.test(v) || /^https?:\/\//i.test(v),
    'Image must be a data URL or http(s) URL'
  );

export const updateOwnProfileSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').optional(),
  email: z.string().email('Valid email is required').optional().nullable(),
  phone: z.string().min(5, 'Valid phone number is required').optional(),
  avatarUrl: avatarUrlSchema.nullable().optional(),
});

export const updateSystemSettingSchema = z.object({
  value: z.string().min(1, 'Value is required'),
});

// ---------- Menu Schemas ----------
const imageUrlSchema = z
  .string()
  .max(3_500_000, 'Image is too large (max ~2.5MB)')
  .refine(
    (v) => /^data:image\//i.test(v) || /^https?:\/\//i.test(v),
    'Image must be a data URL or http(s) URL'
  );

export const createMenuItemSchema = z.object({
  name: z.string().min(1, 'Item name is required'),
  category: z.nativeEnum(MenuCategory),
  price: z.number().int('Price must be an integer (cents)').positive('Price must be greater than 0'),
  isAvailable: z.boolean().default(true),
  imageUrl: imageUrlSchema.nullable().optional(),
});

export const updateMenuItemSchema = z.object({
  name: z.string().min(1).optional(),
  category: z.nativeEnum(MenuCategory).optional(),
  price: z.number().int('Price must be an integer (cents)').positive('Price must be greater than 0').optional(),
  isAvailable: z.boolean().optional(),
  imageUrl: imageUrlSchema.nullable().optional(),
});

export const availabilitySchema = z.object({
  isAvailable: z.boolean(),
});

// ---------- Order Schemas ----------
export const orderItemInputSchema = z.object({
  menuItemId: z.string().min(1, 'menuItemId is required'),
  name: z.string().min(1, 'Item name is required'),
  unitPrice: z.number().nonnegative('Unit price must be nonnegative'),
  quantity: z.number().int().positive('Quantity must be at least 1'),
  notes: z.string().default(''),
});

export const createOrderSchema = z.object({
  clientOrderId: z.string().uuid('clientOrderId must be a valid UUID v4'),
  tableNumber: z.string().min(1, 'Table number is required'),
  items: z.array(orderItemInputSchema).min(1, 'Order must contain at least 1 item'),
});

export const payOrderSchema = z.object({
  paymentMethod: z.enum(['CASH', 'CARD', 'MOBILE']),
});

export const createSettlementSchema = z.object({
  amountMinor: z.number().int().positive('Amount must be greater than zero'),
  method: z.enum(['CASH', 'CARD', 'MOBILE'], {
    errorMap: () => ({ message: 'Payment method must be CASH, CARD, or MOBILE' }),
  }),
  reference: z.string().optional(),
  note: z.string().optional(),
});

export const cancelRequestSchema = z.object({
  reason: z.string().min(2, 'Cancellation reason is required'),
});

export const createCancellationRequestSchema = z.object({
  reason: z.string().min(2, 'Cancellation reason is required'),
});

export const rejectCancellationRequestSchema = z.object({
  rejectedReason: z.string().min(2, 'Rejection reason is required'),
});

// ---------- Attendance Schemas ----------
export const createAttendanceSchema = z.object({
  userId: z.string().min(1, 'userId is required'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  status: z.nativeEnum(AttendanceStatus),
  note: z.string().default(''),
});

export const bulkAttendanceSchema = z.object({
  records: z.array(createAttendanceSchema),
});

// ---------- Payroll Schemas ----------
export const payrollEntrySchema = z.object({
  userId: z.string().min(1, 'userId is required'),
  periodMonth: z.number().int().min(1, 'Month must be between 1 and 12').max(12),
  periodYear: z.number().int().min(2000).max(2100),
  paidAmount: z.number().min(0, 'paidAmount must be non-negative'),
  note: z.string().optional(),
});

/** @deprecated Use payrollEntrySchema — kept alias for any leftover imports */
export const payrollRunSchema = payrollEntrySchema;
