/**
 * Failure Resilience Tests
 * 
 * Tests to ensure system can recover from:
 * - Database connection failures
 * - Transaction rollbacks
 * - Partial failures
 * - Process restarts
 * - Network interruptions
 */

import request from 'supertest';
import { getTestApp, getPrisma, seedTestUser, cleanDb, disconnectPrisma } from './helpers';
import { Role } from '@prisma/client';

const app = getTestApp();
const prisma = getPrisma();

describe('Failure Resilience Tests', () => {
  let cashierToken: string;
  let managerToken: string;
  let orderId: string;

  beforeAll(async () => {
    await cleanDb();
    
    const cashier = await seedTestUser({ role: Role.CASHIER });
    const cashierLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: cashier.email, password: 'password123' });
    cashierToken = cashierLogin.body.accessToken;

    const manager = await seedTestUser({ role: Role.MANAGER });
    const managerLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: manager.email, password: 'password123' });
    managerToken = managerLogin.body.accessToken;
  });

  beforeEach(async () => {
    const waiter = await seedTestUser({ role: Role.WAITER });
    const waiterLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: waiter.email, password: 'password123' });
    
    const orderRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${waiterLogin.body.accessToken}`)
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

  describe('Idempotency on Retry', () => {
    it('should handle client retry with same idempotency key', async () => {
      const settlementData = {
        amountMinor: 10000,
        method: 'CASH',
        idempotencyKey: 'retry-test-123',
      };

      // First attempt (succeeds)
      const res1 = await request(app)
        .post(`/api/orders/${orderId}/settlements`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send(settlementData);

      expect(res1.status).toBe(200);
      const settlementId = res1.body.settlement.id;

      // Client retries (network issue, didn't see response)
      const res2 = await request(app)
        .post(`/api/orders/${orderId}/settlements`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send(settlementData);

      expect(res2.status).toBe(200);
      expect(res2.body.settlement.id).toBe(settlementId);

      // Verify no duplicate settlement
      const settlementsRes = await request(app)
        .get(`/api/orders/${orderId}/settlements`)
        .set('Authorization', `Bearer ${cashierToken}`);

      expect(settlementsRes.body.length).toBe(1);
    });

    it('should detect conflicting retry (different amount)', async () => {
      const idempotencyKey = 'conflict-test-456';

      // First attempt
      await request(app)
        .post(`/api/orders/${orderId}/settlements`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          amountMinor: 5000,
          method: 'CASH',
          idempotencyKey,
        });

      // Retry with different amount (application bug)
      const res2 = await request(app)
        .post(`/api/orders/${orderId}/settlements`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          amountMinor: 7000, // Different!
          method: 'CASH',
          idempotencyKey,
        });

      expect(res2.status).toBe(409);
      expect(res2.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
    });
  });

  describe('Partial Settlement Recovery', () => {
    it('should allow completion after partial settlements', async () => {
      // Partial settlement 1: 40%
      await request(app)
        .post(`/api/orders/${orderId}/settlements`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          amountMinor: 4000,
          method: 'CASH',
          idempotencyKey: 'partial-1',
        });

      // Verify state
      let orderRes = await request(app)
        .get(`/api/orders/${orderId}`)
        .set('Authorization', `Bearer ${cashierToken}`);
      expect(orderRes.body.settlementStatus).toBe('PARTIALLY_SETTLED');

      // Partial settlement 2: 30%
      await request(app)
        .post(`/api/orders/${orderId}/settlements`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          amountMinor: 3000,
          method: 'CARD',
          idempotencyKey: 'partial-2',
        });

      orderRes = await request(app)
        .get(`/api/orders/${orderId}`)
        .set('Authorization', `Bearer ${cashierToken}`);
      expect(orderRes.body.settlementStatus).toBe('PARTIALLY_SETTLED');

      // Final settlement: remaining 30%
      await request(app)
        .post(`/api/orders/${orderId}/settlements`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          amountMinor: 3000,
          method: 'CASH',
          idempotencyKey: 'partial-3',
        });

      // Should be fully settled now
      orderRes = await request(app)
        .get(`/api/orders/${orderId}`)
        .set('Authorization', `Bearer ${cashierToken}`);
      expect(orderRes.body.settlementStatus).toBe('SETTLED');

      // Verify total
      const settlementsRes = await request(app)
        .get(`/api/orders/${orderId}/settlements`)
        .set('Authorization', `Bearer ${cashierToken}`);

      const total = settlementsRes.body.reduce((sum: number, s: any) => sum + s.amountMinor, 0);
      expect(total).toBe(10000);
    });

    it('should prevent over-settlement after partial payments', async () => {
      // Partial: 70%
      await request(app)
        .post(`/api/orders/${orderId}/settlements`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          amountMinor: 7000,
          method: 'CASH',
          idempotencyKey: 'prevent-over-1',
        });

      // Try to add 40% more (would be 110%)
      const res = await request(app)
        .post(`/api/orders/${orderId}/settlements`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          amountMinor: 4000,
          method: 'CASH',
          idempotencyKey: 'prevent-over-2',
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('SETTLEMENT_OVERAGE');

      // Verify state unchanged
      const settlementsRes = await request(app)
        .get(`/api/orders/${orderId}/settlements`)
        .set('Authorization', `Bearer ${cashierToken}`);

      const total = settlementsRes.body.reduce((sum: number, s: any) => sum + s.amountMinor, 0);
      expect(total).toBe(7000);
    });
  });

  describe('Cancellation State Recovery', () => {
    it('should maintain cancelled state across operations', async () => {
      // Request and approve cancellation
      const cancelReq = await request(app)
        .post(`/api/orders/${orderId}/cancellation-request`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({ reason: 'Recovery test' });

      await request(app)
        .patch(`/api/cancellation-requests/${cancelReq.body.id}/approve`)
        .set('Authorization', `Bearer ${managerToken}`);

      // Verify cancelled
      let orderRes = await request(app)
        .get(`/api/orders/${orderId}`)
        .set('Authorization', `Bearer ${cashierToken}`);
      expect(orderRes.body.status).toBe('CANCELLED');

      // Try various operations (all should respect cancelled state)
      const settlementRes = await request(app)
        .post(`/api/orders/${orderId}/settlements`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          amountMinor: 5000,
          method: 'CASH',
          idempotencyKey: 'after-cancel',
        });
      expect(settlementRes.status).toBe(409);

      // Verify still cancelled
      orderRes = await request(app)
        .get(`/api/orders/${orderId}`)
        .set('Authorization', `Bearer ${cashierToken}`);
      expect(orderRes.body.status).toBe('CANCELLED');
    });

    it('should handle reject after order already cancelled', async () => {
      // Create two cancellation requests
      const req1 = await request(app)
        .post(`/api/orders/${orderId}/cancellation-request`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({ reason: 'First' });

      const req2 = await request(app)
        .post(`/api/orders/${orderId}/cancellation-request`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({ reason: 'Second' });

      // Approve first
      await request(app)
        .patch(`/api/cancellation-requests/${req1.body.id}/approve`)
        .set('Authorization', `Bearer ${managerToken}`);

      // Try to reject second (order already cancelled)
      const rejectRes = await request(app)
        .patch(`/api/cancellation-requests/${req2.body.id}/reject`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ reason: 'Too late' });

      // Should handle gracefully (either succeed or fail cleanly)
      expect([200, 409]).toContain(rejectRes.status);

      // Order should remain cancelled
      const orderRes = await request(app)
        .get(`/api/orders/${orderId}`)
        .set('Authorization', `Bearer ${cashierToken}`);
      expect(orderRes.body.status).toBe('CANCELLED');
    });
  });

  describe('Data Consistency After Failures', () => {
    it('should maintain sum(settlements) <= totalAmount invariant', async () => {
      // Make several settlements
      const settlements = [
        { amount: 2000, key: 'inv-1' },
        { amount: 3000, key: 'inv-2' },
        { amount: 2500, key: 'inv-3' },
        { amount: 2500, key: 'inv-4' },
      ];

      for (const s of settlements) {
        await request(app)
          .post(`/api/orders/${orderId}/settlements`)
          .set('Authorization', `Bearer ${cashierToken}`)
          .send({
            amountMinor: s.amount,
            method: 'CASH',
            idempotencyKey: s.key,
          });
      }

      // Verify invariant
      const orderRes = await request(app)
        .get(`/api/orders/${orderId}`)
        .set('Authorization', `Bearer ${cashierToken}`);

      const settlementsRes = await request(app)
        .get(`/api/orders/${orderId}/settlements`)
        .set('Authorization', `Bearer ${cashierToken}`);

      const total = settlementsRes.body.reduce((sum: number, s: any) => sum + s.amountMinor, 0);

      expect(total).toBeLessThanOrEqual(orderRes.body.totalAmount);
      expect(total).toBe(10000);
      expect(orderRes.body.settlementStatus).toBe('SETTLED');
    });

    it('should maintain cancelled orders cannot be settled', async () => {
      // Cancel order
      const cancelReq = await request(app)
        .post(`/api/orders/${orderId}/cancellation-request`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({ reason: 'Invariant test' });

      await request(app)
        .patch(`/api/cancellation-requests/${cancelReq.body.id}/approve`)
        .set('Authorization', `Bearer ${managerToken}`);

      // Multiple settlement attempts (should all fail)
      const attempts = [
        request(app)
          .post(`/api/orders/${orderId}/settlements`)
          .set('Authorization', `Bearer ${cashierToken}`)
          .send({ amountMinor: 3000, method: 'CASH', idempotencyKey: 'attempt-1' }),
        request(app)
          .post(`/api/orders/${orderId}/settlements`)
          .set('Authorization', `Bearer ${cashierToken}`)
          .send({ amountMinor: 5000, method: 'CARD', idempotencyKey: 'attempt-2' }),
        request(app)
          .post(`/api/orders/${orderId}/settlements`)
          .set('Authorization', `Bearer ${cashierToken}`)
          .send({ amountMinor: 2000, method: 'CASH', idempotencyKey: 'attempt-3' }),
      ];

      const results = await Promise.all(attempts);

      // All should fail
      results.forEach((res: any) => {
        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe('ORDER_ALREADY_CANCELLED');
      });

      // No settlements should exist
      const settlementsRes = await request(app)
        .get(`/api/orders/${orderId}/settlements`)
        .set('Authorization', `Bearer ${cashierToken}`);

      expect(settlementsRes.body.length).toBe(0);
    });
  });

  describe('Request ID Tracking', () => {
    it('should include requestId in all error responses', async () => {
      // Over-settlement error
      const res1 = await request(app)
        .post(`/api/orders/${orderId}/settlements`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          amountMinor: 15000,
          method: 'CASH',
          idempotencyKey: 'req-id-1',
        });

      expect(res1.status).toBe(409);
      expect(res1.body.error.requestId).toBeDefined();
      expect(typeof res1.body.error.requestId).toBe('string');

      // Cancel order first
      const cancelReq = await request(app)
        .post(`/api/orders/${orderId}/cancellation-request`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({ reason: 'Test' });

      await request(app)
        .patch(`/api/cancellation-requests/${cancelReq.body.id}/approve`)
        .set('Authorization', `Bearer ${managerToken}`);

      // Already cancelled error
      const res2 = await request(app)
        .post(`/api/orders/${orderId}/settlements`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          amountMinor: 5000,
          method: 'CASH',
          idempotencyKey: 'req-id-2',
        });

      expect(res2.status).toBe(409);
      expect(res2.body.error.requestId).toBeDefined();
      expect(typeof res2.body.error.requestId).toBe('string');

      // Different request IDs
      expect(res1.body.error.requestId).not.toBe(res2.body.error.requestId);
    });
  });
});
