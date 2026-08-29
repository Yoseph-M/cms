/**
 * Shared API contract types.
 * These mirror the Prisma/backend schema and are the single source of truth
 * for the frontend. Update here when the backend API surface changes.
 */

// ── Enums ────────────────────────────────────────────────────────────────────

export type Role = 'OWNER' | 'MANAGER' | 'CASHIER' | 'WAITER';
export type OrderStatus = 'SUBMITTED' | 'IN_KITCHEN' | 'SERVED' | 'PAID' | 'CANCELLED';
export type PaymentMethod = 'CASH' | 'CARD' | 'MOBILE' | 'NONE';
export type MenuCategory = 'FOOD' | 'BEVERAGE' | 'DESSERT' | 'OTHER';
export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'HALF_DAY';

// ── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  name: string;
  role: Role;
  username: string | null;
  phone: string | null;
}

export interface LoginResponse {
  accessToken: string;
  /** Provided for backward-compat; prefer the HttpOnly cookie in the browser */
  refreshToken: string;
  user: AuthUser;
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

// ── Orders ───────────────────────────────────────────────────────────────────

export interface OrderItem {
  menuItemId: string;
  name: string;
  /** Minor units (e.g. cents) */
  unitPrice: number;
  quantity: number;
  notes: string;
}

export interface Order {
  id: string;
  clientOrderId: string;
  tableNumber: string;
  status: OrderStatus;
  /** Minor units (e.g. cents) */
  totalAmount: number;
  isPaid: boolean;
  paymentMethod: PaymentMethod;
  cancellationReason: string | null;
  createdAt: string;
  paidAt: string | null;
  waiterId: string;
  cashierId: string | null;
  cancelledById: string | null;
  waiter: { id: string; name: string } | null;
  cashier: { id: string; name: string } | null;
  cancelledBy: { id: string; name: string } | null;
  items: OrderItem[];
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export type OrdersResponse = PaginatedResponse<Order>;

// ── Menu ─────────────────────────────────────────────────────────────────────

export interface MenuItem {
  id: string;
  name: string;
  category: MenuCategory;
  /** Minor units */
  price: number;
  isAvailable: boolean;
  createdAt: string;
}

// ── Users / Staff ─────────────────────────────────────────────────────────────

export interface StaffUser {
  id: string;
  name: string;
  role: Role;
  username: string | null;
  phone: string;
  /** Minor units */
  salaryAmount: number;
  isActive: boolean;
  createdAt: string;
}

// ── Audit Log ────────────────────────────────────────────────────────────────

export interface AuditLog {
  id: string;
  actorId: string;
  actionType: string;
  targetType: string;
  targetId: string | null;
  details: Record<string, unknown>;
  timestamp: string;
  actor?: { id: string; name: string; role: Role };
}

export interface AuditLogsResponse {
  logs: AuditLog[];
  nextCursor: string | null;
}

// ── Analytics ────────────────────────────────────────────────────────────────

export interface DailySalesResponse {
  date: string;
  /** Minor units */
  totalRevenue: number;
  /** Minor units */
  mtdRevenue: number;
  orderCount: number;
  /** Minor units */
  avgTicket: number;
  activeOrdersCount: number;
  deltas: {
    revenueVsPriorDay: number | null;
    mtdVsPriorMonth: number | null;
    ordersVsPriorDay: number | null;
    aovVsPriorDay: number | null;
  };
}

export interface MonthlyDataPoint {
  month: string;
  revenue: number;
  orderCount: number;
}

export interface TopItem {
  name: string;
  totalQty: number;
  totalRevenue: number;
}

export interface ProfitLossResponse {
  from: string | null;
  to: string | null;
  revenue: number;
  payrollCost: number;
  otherExpenses: number;
  netProfit: number;
}

// ── Generic ───────────────────────────────────────────────────────────────────

export interface ApiError {
  error: string;
  details?: unknown;
}
