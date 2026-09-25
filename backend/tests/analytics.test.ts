/**
 * Analytics & Audit integration tests — Phase 11
 */
import request from 'supertest';
import { OrderStatus } from '@prisma/client';
import { getTestApp, getPrisma, seedTestUser, cleanDb, disconnectPrisma } from './helpers';
import { clearFeatureFlagCache } from '../src/middleware/feature.middleware';

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

  it('GET /analytics/items-by-hour ranks the busiest item first inside each hour', async () => {
    const owner = await seedTestUser({ role: 'OWNER' as any, email: 'items-hour-owner@pos.com' });
    const p = getPrisma();

    // Both orders land in the same business hour (created now), with Coffee the
    // clear winner so the ordering contract is observable.
    await p.order.create({
      data: {
        clientOrderId: 'ord-ih-1',
        tableNumber: '4',
        waiterId: owner.id,
        items: [
          { menuItemId: owner.id, name: 'Coffee', unitPrice: 500, quantity: 3, notes: '' },
          { menuItemId: owner.id, name: 'Tea', unitPrice: 400, quantity: 1, notes: '' },
        ],
        totalAmount: 1900,
        status: OrderStatus.PAID,
        settlementStatus: 'SETTLED',
      },
    });
    await p.order.create({
      data: {
        clientOrderId: 'ord-ih-2',
        tableNumber: '5',
        waiterId: owner.id,
        items: [{ menuItemId: owner.id, name: 'Coffee', unitPrice: 500, quantity: 2, notes: '' }],
        totalAmount: 1000,
        status: OrderStatus.PAID,
        settlementStatus: 'SETTLED',
      },
    });

    const res = await request(app)
      .get('/api/analytics/items-by-hour')
      .set('Authorization', `Bearer ${owner.accessToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const coffee = res.body.find((r: { name: string }) => r.name === 'Coffee');
    const tea = res.body.find((r: { name: string }) => r.name === 'Tea');
    // Quantities sum across orders in the same hour (3 + 2 for Coffee).
    expect(coffee.qty).toBe(5);
    expect(tea.qty).toBe(1);
    expect(coffee.hour).toBe(tea.hour);

    // Canonical shape for the "best seller each hour" panel: hour ascending,
    // busiest item first within the hour.
    const hours = res.body.map((r: { hour: number }) => r.hour);
    expect([...hours].sort((a, b) => a - b)).toEqual(hours);
    const rowsInHour = res.body.filter((r: { hour: number }) => r.hour === coffee.hour);
    expect(rowsInHour[0].name).toBe('Coffee');
    for (let i = 1; i < rowsInHour.length; i += 1) {
      expect(rowsInHour[i - 1].qty).toBeGreaterThanOrEqual(rowsInHour[i].qty);
    }
  });

  /**
   * The Best sellers card (owner + manager dashboards) and the Item Sales page
   * read this endpoint, and the money on it has to be explainable from the row
   * itself: units × the price those units were sold at. Two things used to make
   * it impossible to check:
   *
   *   1. the aggregation counted every non-cancelled ticket, so running and
   *      never-settled tickets were booked as "revenue" — a dish's figure could
   *      exceed the shop's takings for the same window;
   *   2. it reported no price at all, so `today's menu price × units sold` was
   *      the only arithmetic available to the reader, and the books use the
   *      price snapshotted on each order line instead.
   */
  it('GET /analytics/top-items counts paid tickets only, at the sale-time price', async () => {
    const owner = await seedTestUser({ role: 'OWNER' as any, email: 'topitems-owner@pos.com' });
    const p = getPrisma();

    const menuItem = await p.menuItem.create({
      data: { name: 'Beef Steak', category: 'FOOD', price: 3000, isAvailable: true },
    });

    // What the owner reads: 17 sold at the price on the menu — 51,000 ETB.
    await p.order.create({
      data: {
        clientOrderId: 'ord-top-paid-1',
        tableNumber: '1',
        waiterId: owner.id,
        items: [{ menuItemId: menuItem.id, name: 'Beef Steak', unitPrice: 3000, quantity: 17, notes: '' }],
        totalAmount: 51000,
        status: OrderStatus.PAID,
        settlementStatus: 'SETTLED',
      },
    });

    // A running ticket: real food, no money taken yet — never revenue.
    await p.order.create({
      data: {
        clientOrderId: 'ord-top-served-1',
        tableNumber: '2',
        waiterId: owner.id,
        items: [{ menuItemId: menuItem.id, name: 'Beef Steak', unitPrice: 3000, quantity: 100, notes: '' }],
        totalAmount: 300000,
        status: OrderStatus.SERVED,
      },
    });

    const from = new Date(Date.now() - 86_400_000).toISOString();
    const to = new Date(Date.now() + 86_400_000).toISOString();
    const res = await request(app)
      .get(`/api/analytics/top-items?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .set('Authorization', `Bearer ${owner.accessToken}`);

    expect(res.status).toBe(200);
    const row = res.body.find((r: { name: string }) => r.name === 'Beef Steak');
    expect(row).toBeTruthy();
    expect(Number(row.totalQty)).toBe(17);
    expect(Number(row.totalRevenue)).toBe(51000);
    // The price per unit that produced the figure, so the card's own arithmetic
    // (`units × avgUnitPrice`) reconciles with the money shown.
    expect(Number(row.avgUnitPrice)).toBe(3000);
  });

  it('GET /analytics/top-items reports the price the units sold at, not today\u2019s menu price', async () => {
    const owner = await seedTestUser({ role: 'OWNER' as any, email: 'topitems-snap-owner@pos.com' });
    const p = getPrisma();

    // Priced at 3,000 on the menu today…
    const menuItem = await p.menuItem.create({
      data: { name: 'Beef Steak', category: 'FOOD', price: 3000, isAvailable: true },
    });

    // …but these three tickets were rung up when it cost 4,000, and the ticket
    // price is what the books keep.
    await p.order.create({
      data: {
        clientOrderId: 'ord-top-snap-1',
        tableNumber: '3',
        waiterId: owner.id,
        items: [{ menuItemId: menuItem.id, name: 'Beef Steak', unitPrice: 4000, quantity: 3, notes: '' }],
        totalAmount: 12000,
        status: OrderStatus.PAID,
        settlementStatus: 'SETTLED',
      },
    });

    const res = await request(app)
      .get('/api/analytics/top-items')
      .set('Authorization', `Bearer ${owner.accessToken}`);

    expect(res.status).toBe(200);
    const row = res.body.find((r: { name: string }) => r.name === 'Beef Steak');
    expect(Number(row.totalQty)).toBe(3);
    expect(Number(row.totalRevenue)).toBe(12000);
    expect(Number(row.avgUnitPrice)).toBe(4000);
  });

  /**
   * The rule every money endpoint in the module shares: PAID tickets only.
   *
   * A ticket that is still on the floor (or voided) is not revenue. When these
   * aggregations accepted SERVED / IN_KITCHEN tickets, a waiter who never
   * closed a table still showed "sales", a category slice outran the till, and
   * the P&L revenue line disagreed with the headline revenue printed above it
   * on the same page.
   */
  it('counts paid tickets only in every revenue aggregation', async () => {
    const owner = await seedTestUser({ role: 'OWNER' as any, email: 'paidonly-owner@pos.com' });
    const waiter = await seedTestUser({ role: 'WAITER' as any, email: 'paidonly-waiter@pos.com' });
    const p = getPrisma();

    const menuItem = await p.menuItem.create({
      data: { name: 'Paid Only Dish', category: 'FOOD', price: 1000, isAvailable: true },
    });

    // Settled: 2 × 1,000 = 2,000 ETB taken in cash.
    const paid = await p.order.create({
      data: {
        clientOrderId: 'ord-paidonly-1',
        tableNumber: '1',
        waiterId: waiter.id,
        items: [{ menuItemId: menuItem.id, name: 'Paid Only Dish', unitPrice: 1000, quantity: 2, notes: '' }],
        totalAmount: 2000,
        status: OrderStatus.PAID,
        settlementStatus: 'SETTLED',
      },
    });
    await p.settlement.create({
      data: { orderId: paid.id, amountMinor: 2000, method: 'CASH', recordedById: owner.id },
    });

    // Still in the kitchen: 5 × 1,000 ETB of food that has not been paid for,
    // plus a 1,000 part payment that is real cash but not a settled ticket.
    const running = await p.order.create({
      data: {
        clientOrderId: 'ord-paidonly-2',
        tableNumber: '2',
        waiterId: waiter.id,
        items: [{ menuItemId: menuItem.id, name: 'Paid Only Dish', unitPrice: 1000, quantity: 5, notes: '' }],
        totalAmount: 5000,
        status: OrderStatus.IN_KITCHEN,
        settlementStatus: 'PARTIALLY_SETTLED',
      },
    });
    await p.settlement.create({
      data: { orderId: running.id, amountMinor: 1000, method: 'CASH', recordedById: owner.id },
    });

    const auth = { Authorization: `Bearer ${owner.accessToken}` };

    const category = await request(app).get('/api/analytics/category-split').set(auth);
    expect(category.status).toBe(200);
    const food = category.body.find((r: { category: string }) => r.category === 'FOOD');
    expect(Number(food.revenue)).toBe(2000);
    expect(Number(food.count)).toBe(2);

    const staff = await request(app).get('/api/analytics/staff-performance').set(auth);
    expect(staff.status).toBe(200);
    const salesman = staff.body.find((r: { name: string }) => r.name === waiter.name);
    expect(Number(salesman.totalSales)).toBe(2000);
    expect(Number(salesman.orderCount)).toBe(1);

    const peak = await request(app).get('/api/analytics/peak-hours').set(auth);
    expect(peak.status).toBe(200);
    const visits = peak.body.reduce((sum: number, r: { count: number }) => sum + Number(r.count), 0);
    expect(visits).toBe(1);

    const methods = await request(app).get('/api/analytics/payment-methods').set(auth);
    expect(methods.status).toBe(200);
    const cash = methods.body.find((r: { method: string }) => r.method === 'CASH');
    expect(Number(cash.revenue)).toBe(2000);
    expect(Number(cash.count)).toBe(1);

    const pnl = await request(app).get('/api/analytics/profit-loss').set(auth);
    expect(pnl.status).toBe(200);
    expect(Number(pnl.body.revenue)).toBe(2000);
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

    // Menu editing is opt-in per role; enable the owner's switch before writing.
    await getPrisma().systemSetting.create({
      data: { key: 'ownerMenuEditEnabled', value: 'true' },
    });
    clearFeatureFlagCache();

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
