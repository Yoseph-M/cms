/**
 * Phase 13–14 verification suite — hand-computed expectations, RBAC, notifications.
 */
import request from 'supertest';
import { OrderStatus, PaymentMethod } from '@prisma/client';
import { getTestApp, getPrisma, seedTestUser, cleanDb, disconnectPrisma } from './helpers';
import { runScheduledNotificationChecks } from '../src/services/notification.scheduler';
import { createNotification } from '../src/services/notification.service';
import { formatCurrency } from '../src/utils/currency';

const app = getTestApp();

beforeEach(async () => {
  await cleanDb();
});

afterAll(async () => {
  await disconnectPrisma();
});

describe('Currency formatCurrency', () => {
  it('renders as "1,234.50 ETB"', () => {
    expect(formatCurrency(1234.5)).toBe('1,234.50 ETB');
    expect(formatCurrency(0)).toBe('0.00 ETB');
  });
});

describe('Profit/loss hand-computed correctness (§4)', () => {
  it('matches hand-computed totals; excludes cancelled; inclusive boundaries; zeros cleanly', async () => {
    const owner = await seedTestUser({ role: 'OWNER' as any, email: 'v-pnl-owner@pos.com' });
    const waiter = await seedTestUser({ role: 'WAITER' as any, email: 'v-pnl-waiter@pos.com' });
    const p = getPrisma();

    // Hand-computed scenario for 2026-06-01 .. 2026-06-30:
    // Revenue: 100 (boundary from) + 250 (mid) + 50 (boundary to) = 400
    // Cancelled paid-looking order 999 MUST NOT count
    // Payroll: 80 + adjustment +20 = 100
    // Other expenses: 30 + 20 = 50 (PAYROLL category expense ignored)
    // Net = 400 - 100 - 50 = 250

    const fromBoundary = new Date('2026-06-01T00:00:00.000Z');
    const mid = new Date('2026-06-15T12:00:00.000Z');
    const toBoundary = new Date('2026-06-30T23:00:00.000Z');
    const outside = new Date('2026-07-01T00:00:00.000Z');

    await p.order.create({
      data: {
        clientOrderId: 'v-ord-from',
        tableNumber: '1',
        waiterId: waiter.id,
        items: [{ menuItemId: waiter.id, name: 'A', unitPrice: 100, quantity: 1, notes: '' }],
        totalAmount: 100,
        status: OrderStatus.PAID,
        isPaid: true,
        paymentMethod: PaymentMethod.CASH,
        paidAt: fromBoundary,
      },
    });
    await p.order.create({
      data: {
        clientOrderId: 'v-ord-mid',
        tableNumber: '2',
        waiterId: waiter.id,
        items: [{ menuItemId: waiter.id, name: 'B', unitPrice: 125, quantity: 2, notes: '' }],
        totalAmount: 250,
        status: OrderStatus.PAID,
        isPaid: true,
        paymentMethod: PaymentMethod.CARD,
        paidAt: mid,
      },
    });
    await p.order.create({
      data: {
        clientOrderId: 'v-ord-to',
        tableNumber: '3',
        waiterId: waiter.id,
        items: [{ menuItemId: waiter.id, name: 'C', unitPrice: 50, quantity: 1, notes: '' }],
        totalAmount: 50,
        status: OrderStatus.PAID,
        isPaid: true,
        paymentMethod: PaymentMethod.MOBILE,
        paidAt: toBoundary,
      },
    });
    // Cancelled — must be excluded even if isPaid somehow true
    await p.order.create({
      data: {
        clientOrderId: 'v-ord-cancel',
        tableNumber: '4',
        waiterId: waiter.id,
        items: [{ menuItemId: waiter.id, name: 'X', unitPrice: 999, quantity: 1, notes: '' }],
        totalAmount: 999,
        status: OrderStatus.CANCELLED,
        isPaid: false,
        paymentMethod: PaymentMethod.NONE,
        paidAt: mid,
        cancellationReason: 'test',
      },
    });
    // Outside range — excluded
    await p.order.create({
      data: {
        clientOrderId: 'v-ord-out',
        tableNumber: '5',
        waiterId: waiter.id,
        items: [{ menuItemId: waiter.id, name: 'Y', unitPrice: 10, quantity: 1, notes: '' }],
        totalAmount: 10,
        status: OrderStatus.PAID,
        isPaid: true,
        paymentMethod: PaymentMethod.CASH,
        paidAt: outside,
      },
    });

    const payment = await p.userPayment.create({
      data: {
        userId: waiter.id,
        periodMonth: 6,
        periodYear: 2026,
        baseSalary: 12000,
        paidAmount: 80,
        processedById: owner.id,
        paymentDate: mid,
      },
    });
    await p.payrollAdjustment.create({
      data: {
        originalPaymentId: payment.id,
        adjustmentAmount: 20,
        reason: 'Bonus',
        processedById: owner.id,
      },
    });

    await p.expense.create({
      data: {
        category: 'RENT',
        amount: 30,
        description: 'June rent',
        date: fromBoundary,
        recordedById: owner.id,
      },
    });
    await p.expense.create({
      data: {
        category: 'UTILITIES',
        amount: 20,
        description: 'Power',
        date: toBoundary,
        recordedById: owner.id,
      },
    });
    // PAYROLL category expense must NOT double-count into otherExpenses
    await p.expense.create({
      data: {
        category: 'PAYROLL',
        amount: 5000,
        description: 'Should be ignored in otherExpenses',
        date: mid,
        recordedById: owner.id,
      },
    });

    const res = await request(app)
      .get('/api/analytics/profit-loss?from=2026-06-01&to=2026-06-30')
      .set('Authorization', `Bearer ${owner.accessToken}`);

    expect(res.status).toBe(200);
    // Hand-computed — do not re-derive aggregation logic here
    expect(res.body.revenue).toBe(400);
    expect(res.body.payrollCost).toBe(100);
    expect(res.body.otherExpenses).toBe(50);
    expect(res.body.netProfit).toBe(250);
  });

  it('returns clean zeros for an empty date range', async () => {
    const owner = await seedTestUser({ role: 'OWNER' as any, email: 'v-pnl-zero@pos.com' });
    const res = await request(app)
      .get('/api/analytics/profit-loss?from=2099-01-01&to=2099-01-31')
      .set('Authorization', `Bearer ${owner.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      revenue: 0,
      payrollCost: 0,
      otherExpenses: 0,
      netProfit: 0,
    });
    expect(Number.isNaN(res.body.netProfit)).toBe(false);
  });
});

describe('Expenses RBAC & CRUD (§3)', () => {
  it('rejects Cashier POST /expenses with 403', async () => {
    const cashier = await seedTestUser({ role: 'CASHIER' as any, email: 'v-exp-cashier@pos.com' });
    const res = await request(app)
      .post('/api/expenses')
      .set('Authorization', `Bearer ${cashier.accessToken}`)
      .send({
        category: 'RENT',
        amount: 100,
        description: 'Nope',
        date: '2026-06-01',
      });
    expect(res.status).toBe(403);
  });

  it('Manager can CRUD expenses', async () => {
    const manager = await seedTestUser({ role: 'MANAGER' as any, email: 'v-exp-mgr@pos.com' });

    const created = await request(app)
      .post('/api/expenses')
      .set('Authorization', `Bearer ${manager.accessToken}`)
      .send({
        category: 'SUPPLIES',
        amount: 75.25,
        description: 'Napkins',
        date: '2026-06-10',
      });
    expect(created.status).toBe(201);

    const list = await request(app)
      .get('/api/expenses?category=SUPPLIES')
      .set('Authorization', `Bearer ${manager.accessToken}`);
    expect(list.status).toBe(200);
    expect(list.body.some((e: { id: string }) => e.id === created.body.id)).toBe(true);

    const patched = await request(app)
      .patch(`/api/expenses/${created.body.id}`)
      .set('Authorization', `Bearer ${manager.accessToken}`)
      .send({ amount: 80 });
    expect(patched.status).toBe(200);
    expect(patched.body.amount).toBe(80);

    const deleted = await request(app)
      .delete(`/api/expenses/${created.body.id}`)
      .set('Authorization', `Bearer ${manager.accessToken}`);
    expect(deleted.status).toBe(200);
  });
});

describe('Payroll adjustment against manual entry (§2)', () => {
  it('creates adjustment without mutating original paidAmount', async () => {
    const owner = await seedTestUser({ role: 'OWNER' as any, email: 'v-adj-owner@pos.com' });
    const waiter = await seedTestUser({ role: 'WAITER' as any, email: 'v-adj-waiter@pos.com' });

    const entry = await request(app)
      .post('/api/payroll/entries')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        userId: waiter.id,
        periodMonth: 3,
        periodYear: 2026,
        paidAmount: 11000,
        note: 'Bank transfer',
      });
    expect(entry.status).toBe(201);

    const adj = await request(app)
      .post('/api/payroll/adjustments')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        originalPaymentId: entry.body.id,
        reason: 'Missed tip pool',
        adjustmentAmount: 500,
      });
    expect(adj.status).toBe(201);

    const p = getPrisma();
    const original = await p.userPayment.findUnique({ where: { id: entry.body.id } });
    expect(original?.paidAmount).toBe(11000);
  });
});

describe('Notification triggers (§6)', () => {
  it('MISSING_ATTENDANCE created by scheduled check for staff without today record', async () => {
    const owner = await seedTestUser({ role: 'OWNER' as any, email: 'v-att-owner@pos.com' });
    await seedTestUser({ role: 'WAITER' as any, email: 'v-att-waiter@pos.com', name: 'Missing Waiter' });

    await runScheduledNotificationChecks();

    const list = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${owner.accessToken}`);
    expect(list.status).toBe(200);
    expect(
      list.body.some(
        (n: { type: string; message: string }) =>
          n.type === 'MISSING_ATTENDANCE' && /Missing Waiter/.test(n.message)
      )
    ).toBe(true);
  });

  it('PRINTER_FAILURE can be persisted and listed', async () => {
    const owner = await seedTestUser({ role: 'OWNER' as any, email: 'v-pr-owner@pos.com' });
    await createNotification({
      type: 'PRINTER_FAILURE',
      severity: 'critical',
      message: 'Kitchen printer TCP connection failed after retries.',
    });

    const list = await request(app)
      .get('/api/notifications?unreadOnly=true')
      .set('Authorization', `Bearer ${owner.accessToken}`);
    expect(list.body.some((n: { type: string }) => n.type === 'PRINTER_FAILURE')).toBe(true);
  });

  it('MENU_ITEM_UNAVAILABLE uses updatedAt (toggle time), not createdAt', async () => {
    const owner = await seedTestUser({ role: 'OWNER' as any, email: 'v-menu-owner@pos.com' });
    const p = getPrisma();

    const old = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    await p.menuItem.create({
      data: {
        name: 'Stale Soup',
        category: 'FOOD',
        price: 50,
        isAvailable: false,
        createdAt: new Date(), // created recently
        updatedAt: old, // unavailable for > 7 days
      },
    });

    await runScheduledNotificationChecks();

    const list = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${owner.accessToken}`);
    expect(list.body.some((n: { type: string; message: string }) => n.type === 'MENU_ITEM_UNAVAILABLE' && /Stale Soup/.test(n.message))).toBe(true);
  });

  it('SYSTEM_OVERRIDE fires on Owner attendance override', async () => {
    const owner = await seedTestUser({ role: 'OWNER' as any, email: 'v-ov-owner@pos.com' });
    const waiter = await seedTestUser({ role: 'WAITER' as any, email: 'v-ov-waiter@pos.com' });
    const p = getPrisma();

    await p.attendance.create({
      data: { userId: waiter.id, date: '2026-06-01', status: 'PRESENT', note: '' },
    });

    const res = await request(app)
      .post('/api/attendance')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        userId: waiter.id,
        date: '2026-06-01',
        status: 'ABSENT',
        note: 'Correcting mistaken mark',
      });
    expect(res.status).toBe(201);

    const list = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${owner.accessToken}`);
    expect(list.body.some((n: { type: string }) => n.type === 'SYSTEM_OVERRIDE')).toBe(true);
  });

  it('mark-as-read and mark-all-read persist', async () => {
    const owner = await seedTestUser({ role: 'OWNER' as any, email: 'v-read-owner@pos.com' });
    const a = await createNotification({ type: 'SYSTEM_OVERRIDE', severity: 'info', message: 'A' });
    const b = await createNotification({ type: 'SYSTEM_OVERRIDE', severity: 'info', message: 'B' });

    const one = await request(app)
      .patch(`/api/notifications/${a.id}/read`)
      .set('Authorization', `Bearer ${owner.accessToken}`);
    expect(one.body.isRead).toBe(true);

    const all = await request(app)
      .patch('/api/notifications/read-all')
      .set('Authorization', `Bearer ${owner.accessToken}`);
    expect(all.status).toBe(200);

    const unread = await request(app)
      .get('/api/notifications?unreadOnly=true')
      .set('Authorization', `Bearer ${owner.accessToken}`);
    expect(unread.body.find((n: { id: string }) => n.id === b.id)).toBeUndefined();
  });
});
