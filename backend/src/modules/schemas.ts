import { z } from 'zod';
import { Role, MenuCategory, OrderStatus, PaymentMethod, AttendanceStatus } from '@prisma/client';

// ---------- Auth Schemas ----------
export const loginSchema = z.object({
  // Trim before validating: on shared terminals usernames are typed by hand and
  // stray leading/trailing spaces are common. Case is handled in the controller,
  // which matches usernames case-insensitively.
  username: z.string().trim().min(3, 'Username must be at least 3 characters'),
  password: z.string().min(1, 'Password is required'),
});

export const refreshTokenSchema = z.object({
  // Prefer the HttpOnly cookie; body is ignored (kept for schema compat)
  refreshToken: z.string().optional(),
});

// ---------- PIN (mobile app) ----------
/** Exactly 4 digits — the credential the mobile app asks for after picking a name. */
export const pinCodeSchema = z
  .string()
  .regex(/^\d{4}$/, 'PIN must be 4 digits');

export const pinLoginSchema = z.object({
  userId: z.string().min(1, 'User is required'),
  pinCode: pinCodeSchema,
});

// ---------- User / Staff Schemas ----------
export const createUserSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  role: z.nativeEnum(Role),
  username: z.string().trim().min(3).optional().nullable(),
  phone: z.string().min(5, 'Valid phone number is required'),
  password: z.string().min(6, 'Password must be at least 6 characters').optional(),
  // Mobile-app PIN — only app-facing roles get one.
  pinCode: pinCodeSchema.optional(),
  salaryAmount: z.number().nonnegative().transform((v) => Math.round(v)).default(0),
});

export const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  role: z.nativeEnum(Role).optional(),
  username: z.string().min(3).optional().nullable(),
  phone: z.string().min(5).optional(),
  salaryAmount: z.number().nonnegative().transform((v) => Math.round(v)).optional(),
  isActive: z.boolean().optional(),
  // Set directly from the staff edit card; hashed server-side before storage.
  password: z.string().min(6, 'Password must be at least 6 characters').optional(),
  // Blank/absent keeps the current PIN. Hashed server-side too.
  pinCode: pinCodeSchema.optional(),
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
  username: z.string().min(3, 'Username must be at least 3 characters').optional().nullable(),
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
  nameAmharic: z.string().trim().min(1).max(200).nullable().optional(),
  category: z.nativeEnum(MenuCategory),
  price: z.number().positive('Price must be greater than 0').transform((v) => Math.round(v)),
  isAvailable: z.boolean().default(true),
  imageUrl: imageUrlSchema.nullable().optional(),
});

export const updateMenuItemSchema = z.object({
  name: z.string().min(1).optional(),
  nameAmharic: z.string().trim().min(1).max(200).nullable().optional(),
  category: z.nativeEnum(MenuCategory).optional(),
  price: z.number().positive('Price must be greater than 0').transform((v) => Math.round(v)).optional(),
  isAvailable: z.boolean().optional(),
  imageUrl: imageUrlSchema.nullable().optional(),
});

export const availabilitySchema = z.object({
  isAvailable: z.boolean(),
});

export const bulkAvailabilitySchema = z.object({
  ids: z.array(z.string().min(1)).min(1, 'At least one item id is required').max(200),
  isAvailable: z.boolean(),
});

// ---------- Order Schemas ----------
export const orderItemInputSchema = z.object({
  menuItemId: z.string().min(1, 'menuItemId is required'),
  // name and unitPrice are optional — the server recomputes them from the DB
  name: z.string().optional(),
  unitPrice: z.number().nonnegative().transform((v) => Math.round(v)).optional(),
  quantity: z.number().int().positive('Quantity must be at least 1'),
  notes: z.string().default(''),
});

export const createOrderSchema = z.object({
  clientOrderId: z.string().uuid('clientOrderId must be a valid UUID v4'),
  tableNumber: z.string().min(1, 'Table number is required'),
  // waiterId is optional — required when a cashier/manager/owner creates the order
  waiterId: z.string().optional(),
  items: z.array(orderItemInputSchema).min(1, 'Order must contain at least 1 item'),
});

export const payOrderSchema = z.object({
  paymentMethod: z.enum(['CASH', 'CARD', 'MOBILE']),
});

export const createSettlementSchema = z.object({
  amountMinor: z.number().positive('Amount must be greater than zero').transform((v) => Math.round(v)),
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
  paidAmount: z.number().min(0, 'paidAmount must be non-negative').transform((v) => Math.round(v)),
  note: z.string().optional(),
});

/** @deprecated Use payrollEntrySchema — kept alias for any leftover imports */
export const payrollRunSchema = payrollEntrySchema;
