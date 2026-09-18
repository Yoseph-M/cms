/**
 * Payroll Integration Tests — manual payroll recording
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

describe('Payroll (§2.1, §5)', () => {
  it('rejects double-recording of payroll for the same period with a clean 409', async () => {
    const owner = await seedTestUser({ role: 'OWNER' as any, email: 'payroll-owner@pos.com' });
    const waiter = await seedTestUser({ role: 'WAITER' as any, email: 'payroll-waiter@pos.com' });

    const payload = {
      userId: waiter.id,
      periodMonth: 5,
      periodYear: 2026,
      paidAmount: 12000,
      note: 'Bank transfer',
    };

    const res1 = await request(app)
      .post('/api/payroll/entries')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send(payload);

    expect(res1.status).toBe(201);
    // Amounts are whole ETB — no cents are added or stored.
    expect(res1.body.paidAmount).toBe(12000);
    // Payroll is mirrored into the expenses ledger automatically.
    expect(res1.body.expenseId).toBeTruthy();

    const res2 = await request(app)
      .post('/api/payroll/entries')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send(payload);

    expect(res2.status).toBe(409);
    expect(res2.body.error).toMatch(/failed/i);
    expect(res2.body.details[0].error).toMatch(/already been recorded/i);

    // The rejected duplicate must not leave a second payroll expense behind.
    const p = getPrisma();
    const payrollExpenses = await p.expense.findMany({ where: { category: 'PAYROLL' } });
    expect(payrollExpenses).toHaveLength(1);
    expect(payrollExpenses[0].amount).toBe(12000);
  });

  it('enforces append-only discipline (no update routes exist)', async () => {
    const owner = await seedTestUser({ role: 'OWNER' as any, email: 'payroll-owner2@pos.com' });
    const p = getPrisma();

    const payment = await p.userPayment.create({
      data: {
        userId: owner.id,
        periodMonth: 1,
        periodYear: 2026,
        baseSalary: 3000,
        paidAmount: 3000,
        processedById: owner.id,
      },
    });

    const patchRes = await request(app)
      .patch(`/api/payroll/${payment.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ paidAmount: 4000 });

    expect(patchRes.status).toBe(404);

    const putRes = await request(app)
      .put(`/api/payroll/${payment.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ paidAmount: 4000 });

    expect(putRes.status).toBe(404);
  });
});
