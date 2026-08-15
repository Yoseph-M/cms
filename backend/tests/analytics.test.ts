/**
 * Analytics & Audit integration tests — Phase 11
 */
import request from 'supertest';
import { OrderStatus } from '@prisma/client';
import { getTestApp, getPrisma, seedTestUser, cleanDb, disconnectPrisma } from './helpers';

const app = getTestApp();

beforeEach(async () => {
  await cleanDb();
});

afterAll(async () => {
  await disconnectPrisma();
});

describe('Analytics endpoints', () => {
  it('GET /analytics/category-split returns aggregated categories', async () => {
    const owner = await seedTestUser({ role: 'OWNER' as any, email: 'analytics-owner@pos.com' });
    const p = getPrisma();

    const menuItem = await p.menuItem.create({
      data: { name: 'Burger', category: 'FOOD', price: 1200, isAvailable: true }, // 12.00 in minor units
    });

    await p.order.create({
      data: {
        clientOrderId: 'ord-cat-1',
        tableNumber: '1',
        waiterId: owner.id,
        items: [{ menuItemId: menuItem.id, name: 'Burger', unitPrice: 1200, quantity: 2, notes: '' }],
        totalAmount: 2400, // 24.00 in minor units
        status: OrderStatus.PAID,
        settlementStatus: 'SETTLED',
      },
    });

    const res = await request(app)
      .get('/api/analytics/category-split')
      .set('Authorization', `Bearer ${owner.accessToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((r: { category: string }) => r.category === 'FOOD')).toBe(true);
  });

  it('GET /analytics/peak-hours returns hour/day buckets', async () => {
    const owner = await seedTestUser({ role: 'OWNER' as any, email: 'peak-owner@pos.com' });
    const p = getPrisma();

    await p.order.create({
      data: {
        clientOrderId: 'ord-peak-1',
        tableNumber: '2',
        waiterId: owner.id,
        items: [{ menuItemId: owner.id, name: 'Coffee', unitPrice: 500, quantity: 1, notes: '' }],
        totalAmount: 500, // 5.00 in minor units
        status: OrderStatus.SUBMITTED,
      },
    });

    const res = await request(app)
      .get('/api/analytics/peak-hours')
      .set('Authorization', `Bearer ${owner.accessToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /analytics/payment-methods returns method split', async () => {
    const owner = await seedTestUser({ role: 'OWNER' as any, email: 'paymeth-owner@pos.com' });
    const p = getPrisma();

    await p.order.create({
      data: {
        clientOrderId: 'ord-pm-1',
        tableNumber: '3',
        waiterId: owner.id,
        items: [{ menuItemId: owner.id, name: 'Tea', unitPrice: 400, quantity: 1, notes: '' }],
        totalAmount: 400, // 4.00 in minor units
        status: OrderStatus.PAID,
        settlementStatus: 'SETTLED',
      },
    });

    const res = await request(app)
      .get('/api/analytics/payment-methods')
      .set('Authorization', `Bearer ${owner.accessToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /analytics/cancellations returns reason counts', async () => {
    const owner = await seedTestUser({ role: 'OWNER' as any, email: 'cancel-owner@pos.com' });
    const p = getPrisma();

    await p.order.create({
      data: {
        clientOrderId: 'ord-cancel-1',
        tableNumber: '4',
        waiterId: owner.id,
        items: [{ menuItemId: owner.id, name: 'Salad', unitPrice: 800, quantity: 1, notes: '' }],
        totalAmount: 800, // 8.00 in minor units
        status: OrderStatus.CANCELLED,
        cancellationReason: 'Customer changed mind',
      },
    });

    const res = await request(app)
      .get('/api/analytics/cancellations')
      .set('Authorization', `Bearer ${owner.accessToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].reason).toBe('Customer changed mind');
  });
});

describe('Audit log API', () => {
  it('GET /audit returns persisted audit entries', async () => {
    const owner = await seedTestUser({ role: 'OWNER' as any, email: 'audit-owner@pos.com' });
    const p = getPrisma();

    await p.auditLog.create({
      data: {
        actorId: owner.id,
        actionType: 'TEST_EVENT',
        targetType: 'System',
        details: { message: 'integration test' },
      },
    });

    const res = await request(app)
      .get('/api/audit')
      .set('Authorization', `Bearer ${owner.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.logs).toHaveLength(1);
    expect(res.body.logs[0].actionType).toBe('TEST_EVENT');
  });

  it('writes audit log when menu item is created', async () => {
    const owner = await seedTestUser({ role: 'OWNER' as any, email: 'audit-menu@pos.com' });

    const createRes = await request(app)
      .post('/api/menu')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Latte', category: 'DRINK', price: 450 });

    expect(createRes.status).toBe(201);

    const auditRes = await request(app)
      .get('/api/audit?actionType=MENU_ITEM_CREATED')
      .set('Authorization', `Bearer ${owner.accessToken}`);

    expect(auditRes.status).toBe(200);
    expect(auditRes.body.logs.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Payroll adjustments', () => {
  it('POST /payroll/adjustments creates linked correction without mutating original', async () => {
    const owner = await seedTestUser({ role: 'OWNER' as any, email: 'adj-owner@pos.com' });
    const p = getPrisma();

    const payment = await p.userPayment.create({
      data: {
        userId: owner.id,
        periodMonth: 3,
        periodYear: 2026,
        baseSalary: 300000,
        paidAmount: 300000,
        processedById: owner.id,
      },
    });

    const adjRes = await request(app)
      .post('/api/payroll/adjustments')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        originalPaymentId: payment.id,
        reason: 'Bonus for extra shift',
        adjustmentAmount: 15000,
      });

    expect(adjRes.status).toBe(201);
    expect(adjRes.body.adjustmentAmount).toBe(15000);

    const original = await p.userPayment.findUnique({ where: { id: payment.id } });
    expect(original?.paidAmount).toBe(300000);

    const ledgerRes = await request(app)
      .get('/api/payroll')
      .set('Authorization', `Bearer ${owner.accessToken}`);

    expect(ledgerRes.status).toBe(200);
    expect(ledgerRes.body.some((r: { recordType: string }) => r.recordType === 'adjustment')).toBe(true);
  });
});

describe('Profit & loss + expenses', () => {
  it('GET /analytics/profit-loss returns revenue / payroll / expenses / net', async () => {
    const owner = await seedTestUser({ role: 'OWNER' as any, email: 'pnl-owner@pos.com' });
    const waiter = await seedTestUser({ role: 'WAITER' as any, email: 'pnl-waiter@pos.com' });
    const p = getPrisma();

    const recordedAt = new Date('2026-06-15T12:00:00Z');

    const order = await p.order.create({
      data: {
        clientOrderId: 'ord-pnl-1',
        tableNumber: '1',
        waiterId: waiter.id,
        items: [{ menuItemId: waiter.id, name: 'Tea', unitPrice: 10000, quantity: 2, notes: '' }],
        totalAmount: 20000,
        createdAt: recordedAt,
        status: OrderStatus.PAID,
        settlementStatus: 'SETTLED',
      },
    });

    // Create settlement record to track the payment
    await p.settlement.create({
      data: {
        orderId: order.id,
        amountMinor: 20000,
        method: 'CASH',
        recordedById: owner.id,
        recordedAt,
      },
    });

    await p.userPayment.create({
      data: {
        userId: waiter.id,
        periodMonth: 6,
        periodYear: 2026,
        baseSalary: 1200000,
        paidAmount: 5000,
        processedById: owner.id,
        paymentDate: recordedAt,
      },
    });

    await p.expense.create({
      data: {
        category: 'RENT',
        amount: 3000,
        description: 'June rent share',
        date: recordedAt,
        recordedById: owner.id,
      },
    });

    const res = await request(app)
      .get('/api/analytics/profit-loss?from=2026-06-01&to=2026-06-30')
      .set('Authorization', `Bearer ${owner.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.revenue).toBe(20000);
    expect(res.body.payrollCost).toBe(5000);
    expect(res.body.otherExpenses).toBe(3000);
    expect(res.body.netProfit).toBe(12000);
  });

  it('POST /expenses creates an expense for Owner', async () => {
    const owner = await seedTestUser({ role: 'OWNER' as any, email: 'exp-owner@pos.com' });
    const res = await request(app)
      .post('/api/expenses')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        category: 'UTILITIES',
        amount: 45050,
        description: 'Electricity',
        date: '2026-06-10',
      });

    expect(res.status).toBe(201);
    expect(res.body.category).toBe('UTILITIES');
    expect(res.body.amount).toBe(45050);
  });
});

describe('Notifications', () => {
  it('lists notifications and marks them read', async () => {
    const owner = await seedTestUser({ role: 'OWNER' as any, email: 'notif-owner@pos.com' });
    const p = getPrisma();

    const n = await p.notification.create({
      data: {
        type: 'MISSING_ATTENDANCE',
        message: 'No attendance for Test Staff',
        severity: 'warning',
      },
    });

    const list = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${owner.accessToken}`);
    expect(list.status).toBe(200);
    expect(list.body.some((x: { id: string }) => x.id === n.id)).toBe(true);

    const mark = await request(app)
      .patch(`/api/notifications/${n.id}/read`)
      .set('Authorization', `Bearer ${owner.accessToken}`);
    expect(mark.status).toBe(200);
    expect(mark.body.isRead).toBe(true);
  });
});
