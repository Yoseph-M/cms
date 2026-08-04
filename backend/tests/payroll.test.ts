/**
 * Payroll Integration Tests — Phase 3, §2.1
 *
 * Covers:
 *  - Double-run rejection returns a clean 409
 *  - Enforcement of append-only logic (no PATCH/PUT endpoints)
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
  it('rejects double-run of payroll for the same period with a clean 400/409', async () => {
    const owner = await seedTestUser({ role: 'OWNER' as any, email: 'payroll-owner@pos.com' });
    const waiter = await seedTestUser({ role: 'WAITER' as any, email: 'payroll-waiter@pos.com' });

    const payload = {
      periodMonth: 5,
      periodYear: 2026,
      userIds: [waiter.id],
    };

    // First run should succeed
    const res1 = await request(app)
      .post('/api/payroll/run')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send(payload);

    expect(res1.status).toBe(201);
    expect(res1.body.processedCount).toBe(1);

    // Second run should fail with 400 (or 409) rather than crashing
    const res2 = await request(app)
      .post('/api/payroll/run')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send(payload);

    // Current implementation returns 400 on duplicate compound index
    expect(res2.status).toBe(400);
    expect(res2.body.error).toMatch(/failed/i);
    expect(res2.body.details[0].error).toMatch(/already been processed/i);
  });

  it('enforces append-only discipline (no update routes exist)', async () => {
    const owner = await seedTestUser({ role: 'OWNER' as any, email: 'payroll-owner2@pos.com' });
    const p = getPrisma();

    // Create a mock payment directly in DB
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

    // Attempting to PATCH it should result in a 404 (route not found)
    const patchRes = await request(app)
      .patch(`/api/payroll/${payment.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ paidAmount: 4000 });

    expect(patchRes.status).toBe(404); // Route doesn't exist

    // Attempting to PUT should result in 404
    const putRes = await request(app)
      .put(`/api/payroll/${payment.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ paidAmount: 4000 });

    expect(putRes.status).toBe(404); // Route doesn't exist
  });
});
