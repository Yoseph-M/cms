/**
 * Test Data Factories
 * 
 * Canonical factories for creating test data with sensible defaults.
 * Follows Phase 8 conventions:
 * - All money in minor units (amountMinor)
 * - settlementStatus instead of isPaid
 * - Proper relationships and constraints
 */

import { PrismaClient, Role, OrderStatus, SettlementStatus, ShiftStatus } from '@prisma/client';
import crypto from 'crypto';

const uuid = () => crypto.randomBytes(12).toString('hex');

/**
 * Factory options for creating test data
 */
export interface FactoryOptions {
  prisma: PrismaClient;
}

/**
 * User factory options
 */
export interface CreateUserOptions {
  name?: string;
  role?: Role;
  email?: string;
  phone?: string;
  salaryAmount?: number;
  passwordHash?: string;
}

/**
 * Create a test user with sensible defaults
 */
export async function createUser(
  { prisma }: FactoryOptions,
  overrides: CreateUserOptions = {}
): Promise<any> {
  const defaultPasswordHash = '$2b$10$rH3q9Z8YvZ7X8YvZ7X8YvZ7X8YvZ7X8YvZ7X8YvZ7X8YvZ7X8Yv'; // "password123"
  
  return prisma.user.create({
    data: {
      name: overrides.name || `Test User ${Date.now()}`,
      role: overrides.role || Role.CASHIER,
      phone: overrides.phone || `+1555${Date.now().toString().slice(-7)}`,
      email: overrides.email || `test-${uuid().slice(0, 8)}@pos.com`,
      salaryAmount: overrides.salaryAmount ?? 3000,
      passwordHash: overrides.passwordHash || defaultPasswordHash,
    },
  });
}

/**
 * MenuItem factory options
 */
export interface CreateMenuItemOptions {
  name?: string;
  category?: 'FOOD' | 'DRINK' | 'DESSERT' | 'OTHER';
  price?: number;
  isAvailable?: boolean;
  description?: string;
}

/**
 * Create a test menu item
 */
export async function createMenuItem(
  { prisma }: FactoryOptions,
  overrides: CreateMenuItemOptions = {}
): Promise<any> {
  return prisma.menuItem.create({
    data: {
      name: overrides.name || `Test Item ${Date.now()}`,
      category: overrides.category || 'FOOD',
      price: overrides.price ?? 1500, // $15.00 in minor units
      isAvailable: overrides.isAvailable ?? true,
    },
  });
}

/**
 * Order factory options
 */
export interface CreateOrderOptions {
  clientOrderId?: string;
  tableNumber?: string;
  waiterId?: string;
  cashierId?: string;
  items?: Array<{
    menuItemId: string;
    name: string;
    unitPrice: number;
    quantity: number;
    notes?: string;
  }>;
  totalAmount?: number;
  status?: OrderStatus;
  settlementStatus?: SettlementStatus;
  cancellationReason?: string;
  cancelledById?: string;
}

/**
 * Create a test order with items
 */
export async function createOrder(
  { prisma }: FactoryOptions,
  overrides: CreateOrderOptions = {}
): Promise<any> {
  // Require waiterId - orders must have a waiter
  if (!overrides.waiterId) {
    throw new Error('waiterId is required to create an order');
  }

  const items = overrides.items || [
    {
      menuItemId: uuid(),
      name: 'Test Item',
      unitPrice: 1000, // $10.00 in minor units
      quantity: 1,
      notes: '',
    },
  ];

  const totalAmount = overrides.totalAmount ?? items.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0
  );

  return prisma.order.create({
    data: {
      clientOrderId: overrides.clientOrderId || uuid(),
      tableNumber: overrides.tableNumber || `T${Math.floor(Math.random() * 20) + 1}`,
      waiterId: overrides.waiterId,
      cashierId: overrides.cashierId,
      items,
      totalAmount,
      status: overrides.status || OrderStatus.SUBMITTED,
      settlementStatus: overrides.settlementStatus || SettlementStatus.UNSETTLED,
      cancellationReason: overrides.cancellationReason || '',
      cancelledById: overrides.cancelledById,
    },
  });
}

/**
 * Settlement factory options
 */
export interface CreateSettlementOptions {
  orderId: string;
  amountMinor?: number;
  method?: 'CASH' | 'CARD' | 'MOBILE';
  reference?: string;
  note?: string;
  recordedById: string;
  recordedAt?: Date;
  idempotencyKey?: string;
}

/**
 * Create a test settlement (payment record)
 */
export async function createSettlement(
  { prisma }: FactoryOptions,
  overrides: CreateSettlementOptions
): Promise<any> {
  if (!overrides.orderId || !overrides.recordedById) {
    throw new Error('orderId and recordedById are required to create a settlement');
  }

  return prisma.settlement.create({
    data: {
      orderId: overrides.orderId,
      amountMinor: overrides.amountMinor ?? 1000, // $10.00 default
      method: overrides.method || 'CASH',
      reference: overrides.reference || '',
      note: overrides.note || '',
      recordedById: overrides.recordedById,
      recordedAt: overrides.recordedAt || new Date(),
      idempotencyKey: overrides.idempotencyKey,
    },
  });
}

/**
 * Order with Settlement - creates a fully settled order
 */
export interface CreateSettledOrderOptions extends CreateOrderOptions {
  settlementMethod?: 'CASH' | 'CARD' | 'MOBILE';
  settlementRecordedById: string;
  settlementReference?: string;
}

/**
 * Create a fully settled order (order + settlement)
 */
export async function createSettledOrder(
  factory: FactoryOptions,
  overrides: CreateSettledOrderOptions
): Promise<{ order: any; settlement: any }> {
  if (!overrides.settlementRecordedById) {
    throw new Error('settlementRecordedById is required');
  }

  // Create order in PAID status
  const order = await createOrder(factory, {
    ...overrides,
    status: OrderStatus.PAID,
    settlementStatus: SettlementStatus.SETTLED,
  });

  // Create matching settlement
  const settlement = await createSettlement(factory, {
    orderId: order.id,
    amountMinor: order.totalAmount,
    method: overrides.settlementMethod || 'CASH',
    reference: overrides.settlementReference || '',
    recordedById: overrides.settlementRecordedById,
  });

  return { order, settlement };
}

/**
 * Cancellation Request factory options
 */
export interface CreateCancellationRequestOptions {
  orderId: string;
  requestedById: string;
  reason?: string;
  status?: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewedById?: string;
  reviewedAt?: Date;
  rejectionReason?: string;
}

/**
 * Create a test cancellation request
 */
export async function createCancellationRequest(
  { prisma }: FactoryOptions,
  overrides: CreateCancellationRequestOptions
): Promise<any> {
  if (!overrides.orderId || !overrides.requestedById) {
    throw new Error('orderId and requestedById are required');
  }

  return prisma.orderCancellationRequest.create({
    data: {
      orderId: overrides.orderId,
      requestedById: overrides.requestedById,
      reason: overrides.reason || 'Test cancellation',
      status: overrides.status || 'PENDING',
      approvedById: overrides.reviewedById,
      approvedAt: overrides.reviewedAt,
      rejectedReason: overrides.rejectionReason,
    },
  });
}

/**
 * Expense factory options
 */
export interface CreateExpenseOptions {
  category?: 'RENT' | 'UTILITIES' | 'SUPPLIES' | 'MAINTENANCE' | 'OTHER';
  amount?: number;
  description?: string;
  date?: Date;
  recordedById: string;
}

/**
 * Create a test expense
 */
export async function createExpense(
  { prisma }: FactoryOptions,
  overrides: CreateExpenseOptions
): Promise<any> {
  if (!overrides.recordedById) {
    throw new Error('recordedById is required to create an expense');
  }

  return prisma.expense.create({
    data: {
      category: overrides.category || 'SUPPLIES',
      amount: overrides.amount ?? 5000, // $50.00 in minor units
      description: overrides.description || 'Test expense',
      date: overrides.date || new Date(),
      recordedById: overrides.recordedById,
    },
  });
}

/**
 * Attendance factory options
 */
export interface CreateAttendanceOptions {
  userId: string;
  date?: string;
  status?: 'PRESENT' | 'ABSENT' | 'LEAVE' | 'HOLIDAY' | 'HALF_DAY';
  notes?: string;
}

/**
 * Create a test attendance record
 */
export async function createAttendance(
  { prisma }: FactoryOptions,
  overrides: CreateAttendanceOptions
): Promise<any> {
  if (!overrides.userId) {
    throw new Error('userId is required to create attendance');
  }

  return prisma.attendance.create({
    data: {
      userId: overrides.userId,
      date: overrides.date || new Date().toISOString().split('T')[0],
      status: overrides.status || 'PRESENT',
      note: overrides.notes || '',
    },
  });
}

/**
 * Payroll Entry factory options
 */
export interface CreatePayrollEntryOptions {
  userId: string;
  periodMonth: number;
  periodYear: number;
  baseSalary?: number;
  deductions?: number;
  paidAmount?: number;
  processedById: string;
  paymentDate?: Date;
}

/**
 * Create a test payroll entry
 */
export async function createPayrollEntry(
  { prisma }: FactoryOptions,
  overrides: CreatePayrollEntryOptions
): Promise<any> {
  if (!overrides.userId || !overrides.processedById) {
    throw new Error('userId and processedById are required');
  }

  const baseSalary = overrides.baseSalary ?? 300000; // $3000.00
  const deductions = overrides.deductions ?? 0;

  return prisma.userPayment.create({
    data: {
      userId: overrides.userId,
      periodMonth: overrides.periodMonth,
      periodYear: overrides.periodYear,
      baseSalary,
      paidAmount: overrides.paidAmount ?? baseSalary - deductions,
      processedById: overrides.processedById,
      paymentDate: overrides.paymentDate || new Date(),
    },
  });
}

/**
 * System Setting factory options
 */
export interface CreateSystemSettingOptions {
  key: string;
  value?: string;
  description?: string;
}

/**
 * Create a test system setting
 */
export async function createSystemSetting(
  { prisma }: FactoryOptions,
  overrides: CreateSystemSettingOptions
): Promise<any> {
  if (!overrides.key) {
    throw new Error('key is required to create a system setting');
  }

  return prisma.systemSetting.create({
    data: {
      key: overrides.key,
      value: overrides.value || 'test-value',
    },
  });
}

/**
 * CashierShift factory options
 */
export interface CreateShiftOptions {
  cashierId: string;
  openedById: string;
  status?: ShiftStatus;
  openingCashMinor?: number;
}

/**
 * Create a test cashier shift
 */
export async function createShift(
  { prisma }: FactoryOptions,
  overrides: CreateShiftOptions
): Promise<any> {
  return prisma.cashierShift.create({
    data: {
      cashierId: overrides.cashierId,
      openedById: overrides.openedById,
      status: overrides.status || ShiftStatus.OPEN,
      openingCashMinor: overrides.openingCashMinor ?? 1000,
      openedAt: new Date(),
    },
  });
}
export interface CreatePrinterStationOptions {
  station?: 'KITCHEN' | 'BAR' | 'RECEIPT';
  ip?: string;
  port?: number;
  isOnline?: boolean;
}

/**
 * Create a test printer station
 */
export async function createPrinterStation(
  { prisma }: FactoryOptions,
  overrides: CreatePrinterStationOptions = {}
): Promise<any> {
  return prisma.printerStation.create({
    data: {
      station: overrides.station || 'KITCHEN',
      ip: overrides.ip || '192.168.1.100',
      port: overrides.port || 9100,
    },
  });
}

/**
 * Helper: Create a complete test scenario with all entities
 */
export interface CreateTestScenarioOptions {
  includeMenuItems?: boolean;
  includeOrders?: boolean;
  includeSettlements?: boolean;
  includePrinters?: boolean;
}

/**
 * Create a complete test scenario with common entities
 */
export async function createTestScenario(
  factory: FactoryOptions,
  options: CreateTestScenarioOptions = {}
): Promise<{
  owner: any;
  manager: any;
  cashier: any;
  waiter: any;
  menuItems?: any[];
  orders?: any[];
  settlements?: any[];
  printers?: any[];
}> {
  // Create users for each role
  const owner = await createUser(factory, { role: Role.OWNER, email: 'owner@test.com' });
  const manager = await createUser(factory, { role: Role.MANAGER, email: 'manager@test.com' });
  const cashier = await createUser(factory, { role: Role.CASHIER, email: 'cashier@test.com' });
  const waiter = await createUser(factory, { role: Role.WAITER, email: 'waiter@test.com' });

  const result: any = { owner, manager, cashier, waiter };

  if (options.includeMenuItems) {
    result.menuItems = [
      await createMenuItem(factory, { name: 'Burger', category: 'FOOD', price: 1500 }),
      await createMenuItem(factory, { name: 'Coffee', category: 'DRINK', price: 500 }),
      await createMenuItem(factory, { name: 'Cake', category: 'DESSERT', price: 800 }),
    ];
  }

  if (options.includeOrders && result.menuItems) {
    const order1 = await createOrder(factory, {
      waiterId: waiter.id,
      items: [{
        menuItemId: result.menuItems[0].id,
        name: result.menuItems[0].name,
        unitPrice: result.menuItems[0].price,
        quantity: 2,
      }],
      status: OrderStatus.SERVED,
    });

    const order2 = await createOrder(factory, {
      waiterId: waiter.id,
      items: [{
        menuItemId: result.menuItems[1].id,
        name: result.menuItems[1].name,
        unitPrice: result.menuItems[1].price,
        quantity: 1,
      }],
      status: OrderStatus.IN_KITCHEN,
    });

    result.orders = [order1, order2];

    if (options.includeSettlements) {
      const settlement = await createSettlement(factory, {
        orderId: order1.id,
        amountMinor: order1.totalAmount,
        method: 'CASH',
        recordedById: cashier.id,
      });
      result.settlements = [settlement];

      // Update order to PAID
      await factory.prisma.order.update({
        where: { id: order1.id },
        data: { 
          status: OrderStatus.PAID,
          settlementStatus: SettlementStatus.SETTLED,
        },
      });
    }
  }

  if (options.includePrinters) {
    result.printers = [
      await createPrinterStation(factory, { station: 'KITCHEN', ip: '192.168.1.10' }),
      await createPrinterStation(factory, { station: 'BAR', ip: '192.168.1.11' }),
      await createPrinterStation(factory, { station: 'RECEIPT', ip: '192.168.1.12' }),
    ];
  }

  return result;
}

