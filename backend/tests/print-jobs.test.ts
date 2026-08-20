/**
 * Print Jobs and Windows Print Agent Tests
 * 
 * Tests for kitchen ticket printing with Windows Print Agent integration
 */

import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/services/prisma.service';
import { Role, OrderStatus, PrintJobStatus, PrintTransport } from '@prisma/client';
import crypto from 'crypto';
import { hashPassword } from '../src/utils/security';

// Simple helper to create test users
async function createTestUser(role: Role, phone?: string) {
  const phoneNum = phone || `+1555${Date.now()}${Math.random().toString().slice(2, 5)}`;
  return prisma.user.create({
    data: {
      name: `Test ${role}`,
      role,
      phone: phoneNum,
      passwordHash: await hashPassword('password123'),
      salaryAmount: 3000,
    },
  });
}

// Simple helper to login
async function loginTestUser(phone: string): Promise<string> {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ phone, password: 'password123' });
  return res.body.accessToken;
}

// Simple helper to create menu item
async function createTestMenuItem(data: { name: string; price: number }) {
  return prisma.menuItem.create({
    data: {
      name: data.name,
      category: 'FOOD',
      price: data.price,
      isAvailable: true,
    },
  });
}

// Simple helper to create order
async function createTestOrder(data: { items: any[]; waiterId?: string }) {
  const waiter = data.waiterId ? await prisma.user.findUnique({ where: { id: data.waiterId } }) :
    await createTestUser(Role.WAITER);
  
  return prisma.order.create({
    data: {
      clientOrderId: `test-${Date.now()}-${Math.random().toString().slice(2, 8)}`,
      tableNumber: '1',
      waiterId: waiter!.id,
      items: data.items,
      totalAmount: data.items.reduce((sum: number, item: any) => sum + item.unitPrice * item.quantity, 0),
      status: OrderStatus.SUBMITTED,
    },
  });
}

describe('Print Jobs and Print Agents', () => {
  let ownerToken: string;
  let managerToken: string;
  let cashierToken: string;
  let waiterToken: string;
  let ownerId: string;

  let testAgentToken: string;
  let testAgentId: string;
  let testAgentTokenHash: string;

  beforeAll(async () => {
    // Create users
    const owner = await createTestUser(Role.OWNER, '+15551000001');
    const manager = await createTestUser(Role.MANAGER, '+15551000002');
    const cashier = await createTestUser(Role.CASHIER, '+15551000003');
    const waiter = await createTestUser(Role.WAITER, '+15551000004');

    ownerId = owner.id;
    ownerToken = await loginTestUser(owner.phone);
    managerToken = await loginTestUser(manager.phone);
    cashierToken = await loginTestUser(cashier.phone);
    waiterToken = await loginTestUser(waiter.phone);

    // Configure kitchen printer for Windows
    await prisma.printerStation.deleteMany({});
    await prisma.printerStation.create({
      data: {
        station: 'kitchen',
        transport: PrintTransport.WINDOWS,
        printerName: 'Test Kitchen Printer',
      },
    });
  });

  afterAll(async () => {
    await prisma.printerStation.deleteMany({});
    await prisma.printAgent.deleteMany({});
    await prisma.printJob.deleteMany({});
    await prisma.order.deleteMany({});
    await prisma.menuItem.deleteMany({});
    await prisma.user.deleteMany({});
  });

  describe('Print Agent Registration', () => {
    it('should allow Owner to register a print agent with station assignment', async () => {
      const res = await request(app)
        .post('/api/print-agents/register')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Test Agent 1', station: 'kitchen' })
        .expect(201);

      expect(res.body.agent).toBeDefined();
      expect(res.body.agent.name).toBe('Test Agent 1');
      expect(res.body.agent.station).toBe('kitchen');
      expect(res.body.token).toBeDefined();
      expect(res.body.token).toHaveLength(64);

      testAgentToken = res.body.token;
      testAgentId = res.body.agent.id;
      testAgentTokenHash = crypto.createHash('sha256').update(testAgentToken).digest('hex');
    });

    it('should require station during agent registration', async () => {
      await request(app)
        .post('/api/print-agents/register')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Test Agent Without Station' })
        .expect(400);
    });

    it('should validate station is one of the allowed values', async () => {
      await request(app)
        .post('/api/print-agents/register')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Test Agent Invalid', station: 'invalid_station' })
        .expect(400);
    });

    it('should prevent duplicate agent names', async () => {
      await request(app)
        .post('/api/print-agents/register')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Test Agent 1', station: 'bar' })
        .expect(409);
    });

    it('should prevent Manager from registering agents', async () => {
      await request(app)
        .post('/api/print-agents/register')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ name: 'Test Agent 2', station: 'kitchen' })
        .expect(403);
    });

    it('should validate agent name', async () => {
      await request(app)
        .post('/api/print-agents/register')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: '', station: 'kitchen' })
        .expect(400);
    });
  });

  describe('Print Agent Authentication', () => {
    it('should reject requests without agent token', async () => {
      await request(app)
        .get('/api/print-jobs/pending')
        .expect(401);
    });

    it('should reject requests with invalid agent token', async () => {
      await request(app)
        .get('/api/print-jobs/pending')
        .set('X-Agent-Token', 'invalid-token-123')
        .expect(401);
    });

    it('should accept requests with valid agent token', async () => {
      const res = await request(app)
        .get('/api/print-jobs/pending')
        .set('X-Agent-Token', testAgentToken)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });

    it('should update agent heartbeat on valid requests', async () => {
      const before = await prisma.printAgent.findUnique({ where: { id: testAgentId } });
      
      await request(app)
        .get('/api/print-jobs/pending')
        .set('X-Agent-Token', testAgentToken)
        .expect(200);

      const after = await prisma.printAgent.findUnique({ where: { id: testAgentId } });
      
      expect(after!.lastHeartbeat!.getTime()).toBeGreaterThan(before!.lastHeartbeat?.getTime() || 0);
    });
  });

  describe('Order Creation with Print Job', () => {
    let testItem1: any;
    let testOrder: any;

    beforeAll(async () => {
      testItem1 = await createTestMenuItem({ name: 'Burger', price: 1500 });
    });

    it('should create print job when order is created', async () => {
      const orderData = {
        clientOrderId: `test-order-${Date.now()}`,
        tableNumber: '5',
        items: [{ menuItemId: testItem1.id, quantity: 2, notes: 'No onions' }],
      };

      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${waiterToken}`)
        .send(orderData)
        .expect(201);

      testOrder = res.body.order;

      // Check that a print job was created
      const printJobs = await prisma.printJob.findMany({
        where: { orderId: testOrder.id },
      });

      expect(printJobs).toHaveLength(1);
      expect(printJobs[0].station).toBe('kitchen');
      expect(printJobs[0].transport).toBe(PrintTransport.WINDOWS);
      expect(printJobs[0].status).toBe(PrintJobStatus.QUEUED);
      expect(printJobs[0].payloadBase64).toBeDefined();
    });

    it('should not create duplicate print job on idempotent order creation', async () => {
      const orderData = {
        clientOrderId: testOrder.clientOrderId,
        tableNumber: '5',
        items: [{ menuItemId: testItem1.id, quantity: 2 }],
      };

      await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${waiterToken}`)
        .send(orderData)
        .expect(200);

      const printJobs = await prisma.printJob.findMany({
        where: { orderId: testOrder.id },
      });

      expect(printJobs).toHaveLength(1);
    });
  });

  describe('Print Job Claiming (Agent)', () => {
    let pendingJob: any;

    beforeAll(async () => {
      const jobs = await prisma.printJob.findMany({
        where: { status: PrintJobStatus.QUEUED },
        orderBy: { createdAt: 'asc' },
      });
      pendingJob = jobs[0];
    });

    it('should allow agent to fetch pending jobs for its station', async () => {
      const res = await request(app)
        .get('/api/print-jobs/pending')
        .set('X-Agent-Token', testAgentToken)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0].status).toBe(PrintJobStatus.QUEUED);
      // All jobs should be for kitchen station (agent's assigned station)
      expect(res.body.every((job: any) => job.station === 'kitchen')).toBe(true);
    });

    it('should not return jobs from other stations', async () => {
      // Create a bar station job
      const barItem = await createTestMenuItem({ name: 'Cocktail', price: 1200 });
      const barWaiter = await createTestUser(Role.WAITER);
      const barOrder = await createTestOrder({
        items: [{ 
          menuItemId: barItem.id,
          name: barItem.name,
          unitPrice: barItem.price,
          quantity: 1 
        }],
        waiterId: barWaiter.id,
      });

      // Manually create a bar print job
      await prisma.printJob.create({
        data: {
          orderId: barOrder.id,
          station: 'bar',
          transport: PrintTransport.WINDOWS,
          printerName: 'Bar Printer',
          payloadBase64: Buffer.from('test').toString('base64'),
          status: PrintJobStatus.QUEUED,
        },
      });

      const res = await request(app)
        .get('/api/print-jobs/pending')
        .set('X-Agent-Token', testAgentToken)
        .expect(200);

      // Should not include bar station jobs
      const barJobs = res.body.filter((job: any) => job.station === 'bar');
      expect(barJobs).toHaveLength(0);
    });

    it('should allow agent to claim a job from its station', async () => {
      const res = await request(app)
        .post(`/api/print-jobs/${pendingJob.id}/claim`)
        .set('X-Agent-Token', testAgentToken)
        .expect(200);

      expect(res.body.status).toBe(PrintJobStatus.PRINTING);
      expect(res.body.claimedById).toBe(testAgentId);
      expect(res.body.claimedAt).toBeDefined();
      expect(res.body.attempts).toBe(1);
    });

    it('should prevent agent from claiming job from different station', async () => {
      // Create another agent for bar station
      const barAgentRes = await request(app)
        .post('/api/print-agents/register')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Bar Agent', station: 'bar' });

      const barAgentToken = barAgentRes.body.token;

      // Try to claim kitchen job with bar agent
      await request(app)
        .post(`/api/print-jobs/${pendingJob.id}/claim`)
        .set('X-Agent-Token', barAgentToken)
        .expect(403);
    });

    it('should prevent claiming already claimed job', async () => {
      await request(app)
        .post(`/api/print-jobs/${pendingJob.id}/claim`)
        .set('X-Agent-Token', testAgentToken)
        .expect(409);
    });

    it('should allow agent to acknowledge success', async () => {
      const res = await request(app)
        .post(`/api/print-jobs/${pendingJob.id}/ack`)
        .set('X-Agent-Token', testAgentToken)
        .send({ status: 'PRINTED' })
        .expect(200);

      expect(res.body.success).toBe(true);

      const updated = await prisma.printJob.findUnique({ where: { id: pendingJob.id } });
      expect(updated!.status).toBe(PrintJobStatus.PRINTED);
      expect(updated!.printedAt).not.toBeNull();
    });

    it('should be idempotent for duplicate ACK', async () => {
      const res = await request(app)
        .post(`/api/print-jobs/${pendingJob.id}/ack`)
        .set('X-Agent-Token', testAgentToken)
        .send({ status: 'PRINTED' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.idempotent).toBe(true);
    });
  });

  describe('Print Job Failure and Retry', () => {
    let failedJobId: string;

    beforeAll(async () => {
      // Create a test order
      const item = await createTestMenuItem({ name: 'Pizza', price: 2000 });
      const waiter = await createTestUser(Role.WAITER);
      const order = await createTestOrder({
        items: [{ 
          menuItemId: item.id, 
          name: item.name,
          unitPrice: item.price,
          quantity: 1 
        }],
        waiterId: waiter.id,
      });

      // Get the print job
      const job = await prisma.printJob.findFirst({
        where: { orderId: order.id },
      });
      failedJobId = job!.id;

      // Simulate failure
      await request(app)
        .post(`/api/print-jobs/${failedJobId}/claim`)
        .set('X-Agent-Token', testAgentToken);

      await request(app)
        .post(`/api/print-jobs/${failedJobId}/ack`)
        .set('X-Agent-Token', testAgentToken)
        .send({ status: 'FAILED', error: 'Printer offline' });
    });

    it('should allow Owner to retry failed job', async () => {
      const res = await request(app)
        .post(`/api/print-jobs/${failedJobId}/retry`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(res.body.status).toBe(PrintJobStatus.QUEUED);
      expect(res.body.lastError).toBeNull();
      expect(res.body.claimedById).toBeNull();
    });

    it('should allow Manager to retry failed job', async () => {
      // Fail it again
      await request(app)
        .post(`/api/print-jobs/${failedJobId}/claim`)
        .set('X-Agent-Token', testAgentToken);

      await request(app)
        .post(`/api/print-jobs/${failedJobId}/ack`)
        .set('X-Agent-Token', testAgentToken)
        .send({ status: 'FAILED', error: 'Still offline' });

      await request(app)
        .post(`/api/print-jobs/${failedJobId}/retry`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
    });

    it('should prevent Cashier from retrying jobs', async () => {
      await request(app)
        .post(`/api/print-jobs/${failedJobId}/retry`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .expect(403);
    });

    it('should prevent retrying non-failed jobs', async () => {
      // Set to PRINTED
      await prisma.printJob.update({
        where: { id: failedJobId },
        data: { status: PrintJobStatus.PRINTED },
      });

      await request(app)
        .post(`/api/print-jobs/${failedJobId}/retry`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(400);
    });
  });

  describe('Order Reprint', () => {
    let testOrderId: string;

    beforeAll(async () => {
      const item = await createTestMenuItem({ name: 'Salad', price: 800 });
      const waiter = await createTestUser(Role.WAITER);
      const order = await createTestOrder({
        items: [{ 
          menuItemId: item.id,
          name: item.name,
          unitPrice: item.price,
          quantity: 1 
        }],
        waiterId: waiter.id,
      });
      testOrderId = order.id;

      // Complete original print job
      const originalJob = await prisma.printJob.findFirst({
        where: { orderId: testOrderId },
      });
      await prisma.printJob.update({
        where: { id: originalJob!.id },
        data: { status: PrintJobStatus.PRINTED },
      });
    });

    it('should allow Owner to reprint an order', async () => {
      const beforeCount = await prisma.printJob.count({
        where: { orderId: testOrderId },
      });

      const res = await request(app)
        .post(`/api/print-jobs/reprint/${testOrderId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(201);

      expect(res.body.orderId).toBe(testOrderId);
      expect(res.body.status).toBe(PrintJobStatus.QUEUED);

      const afterCount = await prisma.printJob.count({
        where: { orderId: testOrderId },
      });

      expect(afterCount).toBe(beforeCount + 1);
    });

    it('should allow Cashier to reprint an order', async () => {
      await request(app)
        .post(`/api/print-jobs/reprint/${testOrderId}`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .expect(201);
    });

    it('should prevent Waiter from reprinting', async () => {
      await request(app)
        .post(`/api/print-jobs/reprint/${testOrderId}`)
        .set('Authorization', `Bearer ${waiterToken}`)
        .expect(403);
    });

    it('should reject reprint for non-existent order', async () => {
      await request(app)
        .post('/api/print-jobs/reprint/000000000000000000000000')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(404);
    });
  });

  describe('Print Agent Revocation', () => {
    it('should allow Owner to revoke an agent', async () => {
      const res = await request(app)
        .post(`/api/print-agents/${testAgentId}/revoke`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(res.body.isRevoked).toBe(true);
    });

    it('should reject requests from revoked agent', async () => {
      await request(app)
        .get('/api/print-jobs/pending')
        .set('X-Agent-Token', testAgentToken)
        .expect(401);
    });

    it('should prevent double revocation', async () => {
      await request(app)
        .post(`/api/print-agents/${testAgentId}/revoke`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(400);
    });
  });

  describe('Printer Configuration Security', () => {
    it('should validate IP address format', async () => {
      await request(app)
        .post('/api/settings/printers')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          stations: [
            {
              station: 'kitchen',
              transport: 'TCP',
              ip: 'invalid-ip',
              port: 9100,
            },
          ],
        })
        .expect(400);
    });

    it('should require printer name for Windows transport', async () => {
      await request(app)
        .post('/api/settings/printers')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          stations: [
            {
              station: 'kitchen',
              transport: 'WINDOWS',
              printerName: '',
            },
          ],
        })
        .expect(400);
    });

    it('should audit printer configuration changes', async () => {
      await request(app)
        .post('/api/settings/printers')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          stations: [
            {
              station: 'kitchen',
              transport: 'TCP',
              ip: '192.168.1.100',
              port: 9100,
            },
          ],
        })
        .expect(200);

      const auditLogs = await prisma.auditLog.findMany({
        where: {
          actionType: 'PRINTER_CONFIG_UPDATE',
          actorId: ownerId,
        },
        orderBy: { timestamp: 'desc' },
        take: 1,
      });

      expect(auditLogs).toHaveLength(1);
    });
  });

  describe('Idempotency and Concurrency', () => {
    it('should prevent two agents from claiming the same job', async () => {
      // Register second agent for kitchen station
      const agent2Res = await request(app)
        .post('/api/print-agents/register')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Test Agent 2', station: 'kitchen' });

      const agent2Token = agent2Res.body.token;

      // Create test order with print job
      const item = await createTestMenuItem({ name: 'Drink', price: 300 });
      const waiter = await createTestUser(Role.WAITER);
      const order = await createTestOrder({
        items: [{ 
          menuItemId: item.id,
          name: item.name,
          unitPrice: item.price,
          quantity: 1 
        }],
        waiterId: waiter.id,
      });

      const job = await prisma.printJob.findFirst({
        where: { orderId: order.id },
      });

      // Both agents try to claim simultaneously
      const [claim1, claim2] = await Promise.all([
        request(app)
          .post(`/api/print-jobs/${job!.id}/claim`)
          .set('X-Agent-Token', testAgentToken),
        request(app)
          .post(`/api/print-jobs/${job!.id}/claim`)
          .set('X-Agent-Token', agent2Token),
      ]);

      // One should succeed, one should fail
      const succeeded = [claim1, claim2].filter(r => r.status === 200);
      const failed = [claim1, claim2].filter(r => r.status === 409);

      expect(succeeded).toHaveLength(1);
      expect(failed).toHaveLength(1);
    });

    it('should prevent agent from ACKing another agents job', async () => {
      // Register third agent
      const agent3Res = await request(app)
        .post('/api/print-agents/register')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Test Agent 3', station: 'kitchen' });

      const agent3Token = agent3Res.body.token;

      // Create and claim job with agent 2
      const agent2Res = await request(app)
        .post('/api/print-agents/register')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Test Agent ACK', station: 'kitchen' });

      const agent2Token = agent2Res.body.token;

      const item = await createTestMenuItem({ name: 'Soup', price: 400 });
      const waiter = await createTestUser(Role.WAITER);
      const order = await createTestOrder({
        items: [{ 
          menuItemId: item.id,
          name: item.name,
          unitPrice: item.price,
          quantity: 1 
        }],
        waiterId: waiter.id,
      });

      const job = await prisma.printJob.findFirst({
        where: { orderId: order.id },
      });

      // Agent 2 claims
      await request(app)
        .post(`/api/print-jobs/${job!.id}/claim`)
        .set('X-Agent-Token', agent2Token)
        .expect(200);

      // Agent 3 tries to ACK
      await request(app)
        .post(`/api/print-jobs/${job!.id}/ack`)
        .set('X-Agent-Token', agent3Token)
        .send({ status: 'PRINTED' })
        .expect(403);
    });
  });
});
