/**
 * Global search coverage: the header search reaches money records, payroll and
 * printers, and stays off-limits for cashiers.
 */
import request from 'supertest';
import { getTestApp, getPrisma, seedTestUser, cleanDb, disconnectPrisma } from './helpers';

const app = getTestApp();

beforeEach(async () => {
  await cleanDb();
});

afterAll(async () => {
  await disconnectPrisma();
});

async function seedMoneyRecords() {
  const p = getPrisma();
  const owner = await seedTestUser({ role: 'OWNER' as any, name: 'Selam Owner' });
  const barista = await seedTestUser({
    role: 'CASHIER' as any,
    name: 'Tigist Barista',
    username: 'tigist-bar',
  });

  await p.expense.create({
    data: {
      category: 'UTILITIES',
      amount: 1200,
      description: 'Monthly electricity bill',
      date: new Date('2026-08-05T10:00:00.000Z'),
      recordedById: owner.id,
    },
  });

  await p.userPayment.create({
    data: {
      userId: barista.id,
      periodMonth: 8,
      periodYear: 2026,
      baseSalary: 4000,
      paidAmount: 4200,
      note: 'Bonus for extra shifts',
      processedById: owner.id,
    },
  });

  const order = await p.order.create({
    data: {
      clientOrderId: 'search-order-1',
      tableNumber: '7',
      status: 'PAID' as any,
      totalAmount: 340,
      isPaid: true,
      paymentMethod: 'CASH' as any,
      waiterId: barista.id,
      items: [],
    },
  });

  await p.settlement.create({
    data: {
      orderId: order.id,
      amountMinor: 340,
      method: 'CASH' as any,
      reference: 'RC-9911',
      recordedById: barista.id,
    },
  });

  await p.printerStation.create({
    data: {
      station: 'kitchen',
      transport: 'NETWORK' as any,
      ip: '192.168.1.77',
      port: 9100,
    },
  });

  return { owner, barista };
}

describe('GET /api/search', () => {
  it('finds expenses, payroll, settlements and printers for an owner', async () => {
    const { owner } = await seedMoneyRecords();

    const auth = { Authorization: `Bearer ${owner.accessToken}` };

    const byDescription = await request(app).get('/api/search').query({ q: 'electricity' }).set(auth);
    expect(byDescription.status).toBe(200);
    expect(byDescription.body.expenses).toHaveLength(1);
    expect(byDescription.body.expenses[0]).toMatchObject({
      amount: 1200,
      category: 'UTILITIES',
      description: 'Monthly electricity bill',
    });

    const byAmount = await request(app).get('/api/search').query({ q: '1200' }).set(auth);
    expect(byAmount.body.expenses).toHaveLength(1);

    const byStaffAndMonth = await request(app)
      .get('/api/search')
      .query({ q: 'tigist august' })
      .set(auth);
    expect(byStaffAndMonth.body.payroll).toHaveLength(1);
    expect(byStaffAndMonth.body.payroll[0]).toMatchObject({
      periodMonth: 8,
      periodYear: 2026,
      paidAmount: 4200,
      user: { name: 'Tigist Barista' },
    });

    const byMethodAndTable = await request(app)
      .get('/api/search')
      .query({ q: 'cash table 7' })
      .set(auth);
    expect(byMethodAndTable.body.settlements).toHaveLength(1);
    expect(byMethodAndTable.body.settlements[0].order).toMatchObject({ tableNumber: '7' });

    const byPrinter = await request(app).get('/api/search').query({ q: '192.168.1.77' }).set(auth);
    expect(byPrinter.body.printers).toHaveLength(1);
    expect(byPrinter.body.printers[0]).toMatchObject({ station: 'kitchen', transport: 'NETWORK' });
  });

  it('keeps money and printer records out of a cashier\'s results', async () => {
    const { barista } = await seedMoneyRecords();

    const res = await request(app)
      .get('/api/search')
      .query({ q: 'electricity' })
      .set({ Authorization: `Bearer ${barista.accessToken}` });

    expect(res.status).toBe(200);
    expect(res.body.expenses).toEqual([]);
    expect(res.body.payroll).toEqual([]);
    expect(res.body.settlements).toEqual([]);
    expect(res.body.printers).toEqual([]);
    expect(res.body.staff).toEqual([]);
  });
});
