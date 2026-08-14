/**
 * Settlement Production Test Matrix
 * 
 * Critical tests for production deployment to ensure:
 * - Partial settlements work correctly
 * - Over-settlement is prevented
 * - Idempotency works as expected
 */

import request from 'supertest';
import { getTestApp, getPrisma, seedTestUser, cleanDb, disconnectPrisma } from './helpers';
import { Role } from '@prisma/client';

const app = getTestApp();
const prisma = getPrisma();

describe('Settlement Production Tests', () => {
  let cashierToken: string;
  let managerToken: string;
  let orderId: string;

  beforeAll(async () => {
    await cleanDb();
    const cashier = await seedTestUser({ role: Role.CASHIER });
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: cashier.email, password: 'password123' });
    cashierToken = loginRes.body.accessToken;

    const manager = await seedTestUser({ role: Role.MANAGER });
    const managerLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: manager.email, password: 'password123' });
    managerToken = managerLogin.body.accessToken;
  });

  beforeEach(async () => {
    // Create a test order for each test
    const waiter = await seedTestUser({ role: Role.WAITER });
    const waiterLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: waiter.email, password: 'password123' });
    
    const orderRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${waiterLoginRes.body.accessToken}`)
      .send({
        clientOrderId: `test-${Date.now()}`,
        tableNumber: 'T1',
        items: [
          { menuItemId: '507f1f77bcf86cd799439011', name: 'Test Item', unitPrice: 10000, quantity: 1 }
        ],
      });
    
    orderId = orderRes.body.id;
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  describe('Partial Settlement Flow', () => {
    it('should allow partial settlement', async () => {
      // Settle 40% of order
      const res1 = await request(app)
        .post(`/api/orders/${orderId}/settlements`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .set('idempotency-key', 'partial-1')
        .send({
          amountMinor: 4000,
          method: 'CASH',
        });

      expect(res1.status).toBe(201);
      expect(res1.body.settlement.amountMinor).toBe(4000);
      expect(res1.body.order.settlementStatus).toBe('PARTIALLY_SETTLED');
    });

    it('should complete partial settlement', async () => {
      // First partial settlement: 60%
      await request(app)
        .post(`/api/orders/${orderId}/settlements`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .set('idempotency-key', 'partial-first')
        .send({
          amountMinor: 6000,
          method: 'CASH',
        });

      // Second partial settlement: remaining 40%
      const res2 = await request(app)
        .post(`/api/orders/${orderId}/settlements`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .set('idempotency-key', 'partial-second')
        .send({
          amountMinor: 4000,
          method: 'CARD',
        });

      expect(res2.status).toBe(201);
      expect(res2.body.order.settlementStatus).toBe('SETTLED');

      // Verify total settled
      const settlementsRes = await request(app)
        .get(`/api/orders/${orderId}/settlements`)
        .set('Authorization', `Bearer ${cashierToken}`);

      const totalSettled = settlementsRes.body.reduce(
        (sum: number, s: any) => sum + s.amountMinor,
        0
      );
      expect(totalSettled).toBe(10000);
    });
  });

  describe('Over-Settlement Prevention', () => {
    it('should reject settlement exceeding total', async () => {
      const res = await request(app)
        .post(`/api/orders/${orderId}/settlements`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .set('idempotency-key', 'over-settle')
        .send({
          amountMinor: 15000, // 150% of order total
          method: 'CASH',
        });

      expect(res.status).toBe(409);
    });

    it('should reject settlement exceeding remaining amount', async () => {
      // Settle 80%
      await request(app)
        .post(`/api/orders/${orderId}/settlements`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .set('idempotency-key', 'first-80')
        .send({
          amountMinor: 8000,
          method: 'CASH',
        });

      // Try to settle 30% more (would be 110% total)
      const res = await request(app)
        .post(`/api/orders/${orderId}/settlements`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .set('idempotency-key', 'second-30')
        .send({
          amountMinor: 3000,
          method: 'CASH',
        });

      expect(res.status).toBe(409);
    });
  });

  describe('Idempotency', () => {
    it('should return existing settlement for duplicate idempotency key', async () => {
      const settlementData = {
        amountMinor: 5000,
        method: 'CASH',
      };

      // First request
      const res1 = await request(app)
        .post(`/api/orders/${orderId}/settlements`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .set('idempotency-key', 'unique-key-123')
        .send(settlementData);

      expect(res1.status).toBe(201);
      const settlementId1 = res1.body.settlement.id;

      // Second request with same key
      const res2 = await request(app)
        .post(`/api/orders/${orderId}/settlements`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .set('idempotency-key', 'unique-key-123')
        .send(settlementData);

      expect([200, 201]).toContain(res2.status);
      expect(res2.body.settlement.id).toBe(settlementId1);

      // Verify only one settlement was created
      const settlementsRes = await request(app)
        .get(`/api/orders/${orderId}/settlements`)
        .set('Authorization', `Bearer ${cashierToken}`);

      expect(settlementsRes.body.length).toBe(1);
    });
  });

  describe('Financial Invariants', () => {
    it('should maintain: sum(settlements) <= totalAmount', async () => {
      // Make multiple partial settlements
      await request(app)
        .post(`/api/orders/${orderId}/settlements`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .set('idempotency-key', 'inv-1')
        .send({
          amountMinor: 3000,
          method: 'CASH',
        });

      await request(app)
        .post(`/api/orders/${orderId}/settlements`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .set('idempotency-key', 'inv-2')
        .send({
          amountMinor: 2000,
          method: 'CASH',
        });

      await request(app)
        .post(`/api/orders/${orderId}/settlements`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .set('idempotency-key', 'inv-3')
        .send({
          amountMinor: 5000,
          method: 'CASH',
        });

      // Verify invariant
      const orderRes = await request(app)
        .get(`/api/orders/${orderId}`)
        .set('Authorization', `Bearer ${cashierToken}`);

      const settlementsRes = await request(app)
        .get(`/api/orders/${orderId}/settlements`)
        .set('Authorization', `Bearer ${cashierToken}`);

      const totalSettled = settlementsRes.body.reduce(
        (sum: number, s: any) => sum + s.amountMinor,
        0
      );

      expect(totalSettled).toBeLessThanOrEqual(orderRes.body.totalAmount);
      expect(orderRes.body.settlementStatus).toBe('SETTLED');
    });

    it('should prevent settlement of cancelled orders', async () => {
      // Request cancellation
      const cancelReqRes = await request(app)
        .post(`/api/orders/${orderId}/cancellation-request`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          reason: 'Test cancellation',
        });

      // Approve cancellation
      await request(app)
        .patch(`/api/cancellation-requests/${cancelReqRes.body.id}/approve`)
        .set('Authorization', `Bearer ${managerToken}`);

      // Try to settle cancelled order
      const res = await request(app)
        .post(`/api/orders/${orderId}/settlements`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .set('idempotency-key', 'cancelled-order')
        .send({
          amountMinor: 5000,
          method: 'CASH',
        });

      expect(res.status).toBe(409);
    });
  });
});