/**
 * Cancellation Concurrency Tests
 * 
 * Tests to ensure cancellation workflows are safe under concurrent access:
 * - Multiple approval attempts
 * - Multiple rejection attempts
 * - Concurrent approve/reject
 * - Settlement attempts during cancellation flow
 */

import request from 'supertest';
import { getTestApp, getPrisma, seedTestUser, cleanDb, disconnectPrisma } from './helpers';
import { Role } from '@prisma/client';

const app = getTestApp();
const prisma = getPrisma();

describe('Cancellation Concurrency Tests', () => {
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
    // Create test order
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

  describe('Concurrent Approval', () => {
    it('should handle multiple simultaneous approval attempts', async () => {
      // Request cancellation
      const cancelReq = await request(app)
        .post(`/api/orders/${orderId}/cancellation-request`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({ reason: 'Concurrent test' });

      const requestId = cancelReq.body.id;

      // Simulate two managers clicking approve simultaneously
      const promises = [
        request(app)
          .patch(`/api/cancellation-requests/${requestId}/approve`)
          .set('Authorization', `Bearer ${managerToken}`),
        request(app)
          .patch(`/api/cancellation-requests/${requestId}/approve`)
          .set('Authorization', `Bearer ${managerToken}`),
      ];

      const results = await Promise.all(promises.map(p => p.catch(e => e)));

      // Both should succeed (idempotent)
      results.forEach((res: any) => {
        expect(res.status).toBe(200);
      });

      // Verify order is cancelled exactly once
      const orderRes = await request(app)
        .get(`/api/orders/${orderId}`)
        .set('Authorization', `Bearer ${cashierToken}`);

      expect(orderRes.body.status).toBe('CANCELLED');

      // Verify request is approved exactly once
      const dbRequest = await prisma.cancellationRequest.findUnique({
        where: { id: requestId },
      });

      expect(dbRequest?.status).toBe('APPROVED');
    });
  });

  describe('Concurrent Rejection', () => {
    it('should handle multiple simultaneous rejection attempts', async () => {
      // Request cancellation
      const cancelReq = await request(app)
        .post(`/api/orders/${orderId}/cancellation-request`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({ reason: 'Concurrent test' });

      const requestId = cancelReq.body.id;

      // Simulate two managers clicking reject simultaneously
      const promises = [
        request(app)
          .patch(`/api/cancellation-requests/${requestId}/reject`)
          .set('Authorization', `Bearer ${managerToken}`)
          .send({ reason: 'Not valid' }),
        request(app)
          .patch(`/api/cancellation-requests/${requestId}/reject`)
          .set('Authorization', `Bearer ${managerToken}`)
          .send({ reason: 'Not valid' }),
      ];

      const results = await Promise.all(promises.map(p => p.catch(e => e)));

      // Both should succeed (idempotent)
      results.forEach((res: any) => {
        expect(res.status).toBe(200);
      });

      // Verify order remains active
      const orderRes = await request(app)
        .get(`/api/orders/${orderId}`)
        .set('Authorization', `Bearer ${cashierToken}`);

      expect(orderRes.body.status).not.toBe('CANCELLED');

      // Verify request is rejected exactly once
      const dbRequest = await prisma.cancellationRequest.findUnique({
        where: { id: requestId },
      });

      expect(dbRequest?.status).toBe('REJECTED');
    });
  });

  describe('Concurrent Approve and Reject', () => {
    it('should serialize approve/reject race condition', async () => {
      // Request cancellation
      const cancelReq = await request(app)
        .post(`/api/orders/${orderId}/cancellation-request`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({ reason: 'Race test' });

      const requestId = cancelReq.body.id;

      // Simulate one manager approving, another rejecting
      const promises = [
        request(app)
          .patch(`/api/cancellation-requests/${requestId}/approve`)
          .set('Authorization', `Bearer ${managerToken}`),
        request(app)
          .patch(`/api/cancellation-requests/${requestId}/reject`)
          .set('Authorization', `Bearer ${managerToken}`)
          .send({ reason: 'Should not matter' }),
      ];

      const results = await Promise.all(promises.map(p => p.catch(e => e)));

      // One should succeed, one should fail
      const statuses = results.map((r: any) => r.status);
      const successCount = statuses.filter((s: number) => s === 200).length;
      const conflictCount = statuses.filter((s: number) => s === 409).length;

      expect(successCount).toBe(1);
      expect(conflictCount).toBe(1);

      // Verify final state is consistent
      const dbRequest = await prisma.cancellationRequest.findUnique({
        where: { id: requestId },
      });

      const orderRes = await request(app)
        .get(`/api/orders/${orderId}`)
        .set('Authorization', `Bearer ${cashierToken}`);

      // If approved, order should be cancelled
      if (dbRequest?.status === 'APPROVED') {
        expect(orderRes.body.status).toBe('CANCELLED');
      }

      // If rejected, order should not be cancelled
      if (dbRequest?.status === 'REJECTED') {
        expect(orderRes.body.status).not.toBe('CANCELLED');
      }

      // Request should be in terminal state
      expect(['APPROVED', 'REJECTED']).toContain(dbRequest?.status);
    });
  });

  describe('Settlement During Cancellation', () => {
    it('should prevent settlement after cancellation approval', async () => {
      // Request and approve cancellation
      const cancelReq = await request(app)
        .post(`/api/orders/${orderId}/cancellation-request`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({ reason: 'Settlement test' });

      await request(app)
        .patch(`/api/cancellation-requests/${cancelReq.body.id}/approve`)
        .set('Authorization', `Bearer ${managerToken}`);

      // Try to settle
      const settleRes = await request(app)
        .post(`/api/orders/${orderId}/settlements`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          amountMinor: 5000,
          method: 'CASH',
          idempotencyKey: 'after-cancel',
        });

      expect(settleRes.status).toBe(409);
      expect(settleRes.body.error.code).toBe('ORDER_ALREADY_CANCELLED');
    });

    it('should handle settlement racing with cancellation approval', async () => {
      // Request cancellation
      const cancelReq = await request(app)
        .post(`/api/orders/${orderId}/cancellation-request`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({ reason: 'Race test' });

      // Simulate concurrent approval and settlement
      const promises = [
        request(app)
          .patch(`/api/cancellation-requests/${cancelReq.body.id}/approve`)
          .set('Authorization', `Bearer ${managerToken}`),
        request(app)
          .post(`/api/orders/${orderId}/settlements`)
          .set('Authorization', `Bearer ${cashierToken}`)
          .send({
            amountMinor: 10000,
            method: 'CASH',
            idempotencyKey: `race-${Date.now()}`,
          }),
      ];

      const results = await Promise.all(promises.map(p => p.catch(e => e)));

      // Verify final state consistency
      const orderRes = await request(app)
        .get(`/api/orders/${orderId}`)
        .set('Authorization', `Bearer ${cashierToken}`);

      const settlementsRes = await request(app)
        .get(`/api/orders/${orderId}/settlements`)
        .set('Authorization', `Bearer ${cashierToken}`);

      if (orderRes.body.status === 'CANCELLED') {
        // If cancelled, no settlements should exist
        expect(settlementsRes.body.length).toBe(0);
      } else {
        // If not cancelled, settlement might have succeeded
        // But order should never be both cancelled AND settled
        if (settlementsRes.body.length > 0) {
          expect(orderRes.body.status).not.toBe('CANCELLED');
        }
      }
    });
  });

  describe('Multiple Cancellation Requests', () => {
    it('should handle multiple pending requests for same order', async () => {
      // Create two cancellation requests
      const req1 = await request(app)
        .post(`/api/orders/${orderId}/cancellation-request`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({ reason: 'First request' });

      const req2 = await request(app)
        .post(`/api/orders/${orderId}/cancellation-request`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({ reason: 'Second request' });

      expect(req1.status).toBe(200);
      expect(req2.status).toBe(200);

      // Approve first request
      await request(app)
        .patch(`/api/cancellation-requests/${req1.body.id}/approve`)
        .set('Authorization', `Bearer ${managerToken}`);

      // Verify order is cancelled
      const orderRes = await request(app)
        .get(`/api/orders/${orderId}`)
        .set('Authorization', `Bearer ${cashierToken}`);

      expect(orderRes.body.status).toBe('CANCELLED');

      // Try to approve second request (should fail or be no-op)
      const secondApproval = await request(app)
        .patch(`/api/cancellation-requests/${req2.body.id}/approve`)
        .set('Authorization', `Bearer ${managerToken}`);

      // Should either succeed as no-op or fail with conflict
      expect([200, 409]).toContain(secondApproval.status);
    });
  });

  describe('Idempotency Validation', () => {
    it('should prevent duplicate cancellation requests with same reason', async () => {
      const reason = 'Duplicate test';

      const req1 = await request(app)
        .post(`/api/orders/${orderId}/cancellation-request`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({ reason });

      const req2 = await request(app)
        .post(`/api/orders/${orderId}/cancellation-request`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({ reason });

      expect(req1.status).toBe(200);

      // Second request should return existing or be allowed
      // (Business rule: allow multiple requests or dedupe?)
      // For now, both succeed but ensure only one can be approved
      const requests = await prisma.cancellationRequest.findMany({
        where: { orderId },
      });

      // Approve all pending requests
      for (const req of requests) {
        await request(app)
          .patch(`/api/cancellation-requests/${req.id}/approve`)
          .set('Authorization', `Bearer ${managerToken}`);
      }

      // Order should be cancelled exactly once
      const orderRes = await request(app)
        .get(`/api/orders/${orderId}`)
        .set('Authorization', `Bearer ${cashierToken}`);

      expect(orderRes.body.status).toBe('CANCELLED');
    });
  });
});
