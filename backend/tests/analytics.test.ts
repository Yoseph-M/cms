/**
 * Analytics & Audit integration tests — Phase 11
 */
import request from 'supertest';
import { OrderStatus, PaymentMethod } from '@prisma/client';
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
      data: { name: 'Burger', category: 'FOOD', price: 12, isAvailable: true },
    });

    await p.order.create({
      data: {
        clientOrderId: 'ord-cat-1',
        tableNumber: '1',
        waiterId: owner.id,
        items: [{ menuItemId: menuItem.id, name: 'Burger', unitPrice: 12, quantity: 2, notes: '' }],
        totalAmount: 24,
        status: OrderStatus.PAID,
        paymentMethod: PaymentMethod.CASH,
        paidAt: new Date(),
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
        items: [{ menuItemId: owner.id, name: 'Coffee', unitPrice: 5, quantity: 1, notes: '' }],
        totalAmount: 5,
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
        items: [{ menuItemId: owner.id, name: 'Tea', unitPrice: 4, quantity: 1, notes: '' }],
        totalAmount: 4,
        status: OrderStatus.PAID,
        paymentMethod: PaymentMethod.CARD,
        paidAt: new Date(),
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
        items: [{ menuItemId: owner.id, name: 'Salad', unitPrice: 8, quantity: 1, notes: '' }],
        totalAmount: 8,
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
      .send({ name: 'Latte', category: 'DRINK', price: 4.5 });

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
        baseSalary: 3000,
        paidAmount: 3000,
        processedById: owner.id,
      },
    });

    const adjRes = await request(app)
      .post('/api/payroll/adjustments')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        originalPaymentId: payment.id,
        reason: 'Bonus for extra shift',
        adjustmentAmount: 150,
      });

    expect(adjRes.status).toBe(201);
    expect(adjRes.body.adjustmentAmount).toBe(150);

    const original = await p.userPayment.findUnique({ where: { id: payment.id } });
    expect(original?.paidAmount).toBe(3000);

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

    const paidAt = new Date('2026-06-15T12:00:00Z');

    await p.order.create({
      data: {
        clientOrderId: 'ord-pnl-1',
        tableNumber: '1',
        waiterId: waiter.id,
        items: [{ menuItemId: waiter.id, name: 'Tea', unitPrice: 100, quantity: 2, notes: '' }],
        totalAmount: 200,
        status: OrderStatus.PAID,
        isPaid: true,
        paymentMethod: PaymentMethod.CASH,
        paidAt,
      },
    });

    await p.userPayment.create({
      data: {
        userId: waiter.id,
        periodMonth: 6,
        periodYear: 2026,
        baseSalary: 12000,
        paidAmount: 50,
        processedById: owner.id,
        paymentDate: paidAt,
      },
    });

    await p.expense.create({
      data: {
        category: 'RENT',
        amount: 30,
        description: 'June rent share',
        date: paidAt,
        recordedById: owner.id,
      },
    });

    const res = await request(app)
      .get('/api/analytics/profit-loss?from=2026-06-01&to=2026-06-30')
      .set('Authorization', `Bearer ${owner.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.revenue).toBe(200);
    expect(res.body.payrollCost).toBe(50);
    expect(res.body.otherExpenses).toBe(30);
    expect(res.body.netProfit).toBe(120);
  });

  it('POST /expenses creates an expense for Owner', async () => {
    const owner = await seedTestUser({ role: 'OWNER' as any, email: 'exp-owner@pos.com' });
    const res = await request(app)
      .post('/api/expenses')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        category: 'UTILITIES',
        amount: 450.5,
        description: 'Electricity',
        date: '2026-06-10',
      });

    expect(res.status).toBe(201);
    expect(res.body.category).toBe('UTILITIES');
    expect(res.body.amount).toBe(450.5);
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
