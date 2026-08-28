export type Role = 'OWNER' | 'MANAGER' | 'CASHIER' | 'WAITER' | 'COOKER' | 'BARISTA';

export type MenuCategory = 'FOOD' | 'DRINK' | 'DESSERT' | 'OTHER';

export type OrderStatus = 'SUBMITTED' | 'IN_KITCHEN' | 'SERVED' | 'PAID' | 'CANCELLED';

export type PaymentMethod = 'CASH' | 'CARD' | 'MOBILE' | 'NONE';

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LEAVE' | 'HOLIDAY' | 'HALF_DAY';

export interface User {
  id: string;
  name: string;
  role: Role;
  email?: string | null;
  phone: string;
  avatarUrl?: string | null;
  salaryAmount: number;
  isActive: boolean;
  createdAt?: string;
}

export interface MenuItem {
  id: string;
  name: string;
  category: MenuCategory;
  price: number;
  isAvailable: boolean;
  imageUrl?: string;
  createdAt?: string;
}

export interface OrderItem {
  menuItemId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  notes?: string;
}

export interface Order {
  id: string;
  clientOrderId: string;
  tableNumber: string;
  waiterId: string;
  waiter?: { id: string; name: string };
  cashierId?: string | null;
  cashier?: { id: string; name: string } | null;
  items: OrderItem[];
  totalAmount: number;
  status: OrderStatus;
  isPaid: boolean;
  paymentMethod: PaymentMethod;
  cancellationReason?: string;
  cancelledById?: string | null;
  cancelledBy?: { id: string; name: string } | null;
  paidAt?: string | null;
  createdAt: string;
  updatedAt: string;
  // Local client-side status flag for offline sync
  isPendingSync?: boolean;
}

export interface Attendance {
  id: string;
  userId: string;
  user?: { id: string; name: string; role: Role };
  date: string; // YYYY-MM-DD
  status: AttendanceStatus;
  source?: 'MANUAL' | 'SYSTEM_LOGIN';
  note?: string;
}

export interface UserPayment {
  id: string;
  userId: string;
  user?: { id: string; name: string; role: Role; salaryAmount: number };
  paymentDate: string;
  periodMonth: number;
  periodYear: number;
  baseSalary: number;
  paidAmount: number;
  processedBy?: { id: string; name: string };
}
