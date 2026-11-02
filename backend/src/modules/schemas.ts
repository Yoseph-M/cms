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
  sku: z.string().trim().max(60).nullable().optional(),
  barcode: z.string().trim().max(80).nullable().optional(),
  cost: z.number().nonnegative().transform((v) => Math.round(v)).nullable().optional(),
  trackInventory: z.boolean().optional(),
  stockQuantity: z.number().int().nonnegative().optional(),
  lowStockThreshold: z.number().int().nonnegative().optional(),
  isAvailable: z.boolean().default(true),
  imageUrl: imageUrlSchema.nullable().optional(),
});

export const updateMenuItemSchema = z.object({
  name: z.string().min(1).optional(),
  nameAmharic: z.string().trim().min(1).max(200).nullable().optional(),
  category: z.nativeEnum(MenuCategory).optional(),
  price: z.number().positive('Price must be greater than 0').transform((v) => Math.round(v)).optional(),
  sku: z.string().trim().max(60).nullable().optional(),
  barcode: z.string().trim().max(80).nullable().optional(),
  cost: z.number().nonnegative().transform((v) => Math.round(v)).nullable().optional(),
  trackInventory: z.boolean().optional(),
  stockQuantity: z.number().int().nonnegative().optional(),
  lowStockThreshold: z.number().int().nonnegative().optional(),
  isAvailable: z.boolean().optional(),
  imageUrl: imageUrlSchema.nullable().optional(),
});

export const stockAdjustmentSchema = z.object({
  delta: z.number().int().refine((value) => value !== 0, 'Quantity change cannot be zero'),
  reason: z.enum(['RECEIVING', 'ADJUSTMENT', 'RETURN']),
  reference: z.string().trim().max(120).optional(),
});

export const createSupplierSchema = z.object({
  name: z.string().trim().min(2).max(120),
  contactName: z.string().trim().max(120).default(''),
  phone: z.string().trim().max(40).default(''),
  email: z.string().trim().email().or(z.literal('')).default(''),
  address: z.string().trim().max(300).default(''),
  notes: z.string().trim().max(1000).default(''),
});
export const updateSupplierSchema = createSupplierSchema.partial().extend({ isActive: z.boolean().optional() });

export const createPurchaseOrderSchema = z.object({
  supplierId: z.string().min(1),
  notes: z.string().trim().max(1000).default(''),
  items: z.array(z.object({
    menuItemId: z.string().min(1),
    quantityOrdered: z.number().int().positive().max(100000),
    unitCost: z.number().int().nonnegative(),
  })).min(1).max(200).refine((items) => new Set(items.map((item) => item.menuItemId)).size === items.length, 'Each product can only appear once.'),
});

export const receivePurchaseOrderSchema = z.object({
  items: z.array(z.object({ menuItemId: z.string().min(1), quantity: z.number().int().positive().max(100000) })).min(1).max(200)
    .refine((items) => new Set(items.map((item) => item.menuItemId)).size === items.length, 'Each product can only appear once.'),
});

export const createCashDrawerEntrySchema = z.object({
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(['OPENING_FLOAT', 'CASH_IN', 'CASH_OUT', 'PETTY_CASH', 'ADJUSTMENT']),
  amount: z.number().int(),
  description: z.string().trim().max(300).default(''),
  reference: z.string().trim().max(120).default(''),
  idempotencyKey: z.string().uuid().optional(),
}).refine((entry) => entry.type === 'ADJUSTMENT' ? entry.amount !== 0 : entry.amount >= 0 && (entry.type === 'OPENING_FLOAT' || entry.amount > 0), {
  message: 'Enter a valid non-negative amount; adjustments must be non-zero.',
});

export const createCustomerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(40).default(''),
  email: z.string().trim().email().or(z.literal('')).default(''),
  notes: z.string().trim().max(1000).default(''),
  discountPercent: z.number().int().min(0).max(99).default(0),
});

export const updateCustomerSchema = createCustomerSchema.partial();

const marketplaceImageSchema = imageUrlSchema.nullable().optional();
export const createMarketplaceBusinessSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().min(3).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  category: z.string().trim().min(2).max(80),
  description: z.string().trim().max(1200).default(''),
  address: z.string().trim().max(240).default(''),
  phone: z.string().trim().min(5).max(40),
  email: z.string().trim().email().or(z.literal('')).default(''),
  logoUrl: marketplaceImageSchema,
});

export const updateMarketplaceBusinessSchema = createMarketplaceBusinessSchema.partial().omit({ slug: true });
export const createMarketplaceMemberSchema = z.object({
  username: z.string().trim().min(3),
  role: z.enum(['OWNER', 'MANAGER']).default('MANAGER'),
});

export const createMarketplaceProductSchema = z.object({
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1600).default(''),
  category: z.string().trim().min(2).max(80),
  sku: z.string().trim().max(80).default(''),
  barcode: z.string().trim().max(100).default(''),
  price: z.number().int().positive(),
  cost: z.number().int().nonnegative().default(0),
  stockQuantity: z.number().int().nonnegative().default(0),
  lowStockAt: z.number().int().nonnegative().default(3),
  imageUrl: marketplaceImageSchema,
  isActive: z.boolean().default(true),
});

export const updateMarketplaceProductSchema = createMarketplaceProductSchema.partial();

export const createMarketplaceVariantSchema = z.object({
  name: z.string().trim().min(1).max(100),
  sku: z.string().trim().max(80).default(''),
  price: z.number().int().positive(),
  stockQuantity: z.number().int().nonnegative().default(0),
  isActive: z.boolean().default(true),
});

export const updateMarketplaceVariantSchema = createMarketplaceVariantSchema.partial();

export const createMarketplaceZoneSchema = z.object({
  name: z.string().trim().min(2).max(100),
  deliveryFee: z.number().int().nonnegative(),
  minimumOrderAmount: z.number().int().nonnegative().default(0),
  estimatedMinutes: z.number().int().min(1).max(1440).default(45),
  isActive: z.boolean().default(true),
});

export const updateMarketplaceZoneSchema = createMarketplaceZoneSchema.partial();

export const createMarketplaceOrderSchema = z.object({
  clientOrderId: z.string().uuid(),
  businessId: z.string().min(1),
  deliveryZoneId: z.string().min(1).optional(),
  customerName: z.string().trim().min(2).max(120),
  customerPhone: z.string().trim().min(5).max(40),
  customerEmail: z.string().trim().email().or(z.literal('')).default(''),
  deliveryAddress: z.string().trim().max(300).default(''),
  note: z.string().trim().max(1000).default(''),
  paymentMethod: z.enum(['CASH_ON_DELIVERY', 'PAY_AT_STORE']).default('CASH_ON_DELIVERY'),
  items: z.array(z.object({
    productId: z.string().min(1),
    variantId: z.string().min(1).optional(),
    quantity: z.number().int().positive().max(100),
  })).min(1).max(80),
});

export const updateMarketplaceOrderStatusSchema = z.object({
  status: z.enum(['ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED']),
  paymentStatus: z.enum(['UNPAID', 'PAID', 'REFUNDED']).optional(),
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
  customerId: z.string().nullable().optional(),
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
