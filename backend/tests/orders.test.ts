/**
 * Orders & Concurrency Integration Tests — Phase 3, §2.1
 *
 * Covers:
 *  - ESC/POS Printing Engine byte generation (preserved from Phase 2)
 *  - Order state machine property-based sweep (every from→to pair)
 *  - Concurrent double-payment (Promise.all, assert one 200 / one 409)
 *  - Idempotent order creation (POST same clientOrderId twice)
 */
import request from 'supertest';
import { OrderStatus } from '@prisma/client';
import { getTestApp, getPrisma, seedTestUser, cleanDb, disconnectPrisma } from './helpers';
import { canTransition } from '../src/utils/orderStateMachine';
import { buildEscPosKitchenTicket } from '../src/services/printer.service';
import crypto from 'crypto';

const uuid = () => crypto.randomUUID();

const app = getTestApp();

beforeEach(async () => {
  await cleanDb();
});

afterAll(async () => {
  await disconnectPrisma();
});

// ---------------------------------------------------------------------------
// ESC/POS Printing Engine
// ---------------------------------------------------------------------------
describe('Order & ESC/POS Printing Engine', () => {
  it('should generate valid ESC/POS byte buffer for kitchen ticket', () => {
    const mockOrder = {
      clientOrderId: '123e4567-e89b-12d3-a456-426614174000',
      tableNumber: '12',
      waiterName: 'David Waiter',
      createdAt: new Date(),
      items: [
        { name: 'Wagyu Gourmet Burger', quantity: 2, notes: 'No onions' },
        { name: 'Artisanal Iced Matcha', quantity: 1 },
      ],
    };

    const buffer = buildEscPosKitchenTicket(mockOrder);
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(50);
    // ESC @ initialize command: 0x1B, 0x40
    expect(buffer[0]).toBe(0x1b);
    expect(buffer[1]).toBe(0x40);
  });
});

// ---------------------------------------------------------------------------
// Order state machine — property-based sweep
// ---------------------------------------------------------------------------
describe('Order state machine (property-based sweep)', () => {
  const allStatuses = Object.values(OrderStatus);

  // Authoritative transition map
  const validTransitions: Record<OrderStatus, OrderStatus[]> = {
    [OrderStatus.SUBMITTED]: [OrderStatus.IN_KITCHEN, OrderStatus.CANCELLED, OrderStatus.PAID],
    [OrderStatus.IN_KITCHEN]: [OrderStatus.SERVED, OrderStatus.CANCELLED, OrderStatus.PAID],
    [OrderStatus.SERVED]: [OrderStatus.PAID, OrderStatus.CANCELLED],
    [OrderStatus.PAID]: [OrderStatus.CANCELLED],
    [OrderStatus.CANCELLED]: [],
  };

  // Iterate every (from, to) pair
  for (const from of allStatuses) {
    for (const to of allStatuses) {
      const expected = validTransitions[from as OrderStatus].includes(to as OrderStatus);
      it(`canTransition(${from}, ${to}) should be ${expected}`, () => {
        expect(canTransition(from, to)).toBe(expected);
      });
    }
  }

  it('self-transitions are always false', () => {
    for (const status of allStatuses) {
      expect(canTransition(status, status)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Concurrent double-payment
// ---------------------------------------------------------------------------
describe('Concurrent double-payment (§2.1)', () => {
  it('fires two simultaneous payOrder requests; exactly one wins', async () => {
    const p = getPrisma();

    // Create a waiter and cashier
    const waiter = await seedTestUser({ role: 'WAITER' as any, email: 'pay-waiter@pos.com', pinCode: '1111' });
    const cashier1 = await seedTestUser({ role: 'CASHIER' as any, email: 'pay-cashier1@pos.com', pinCode: '2222' });
    const cashier2 = await seedTestUser({ role: 'CASHIER' as any, email: 'pay-cashier2@pos.com', pinCode: '3333' });

    // Seed a menu item
    const menuItem = await p.menuItem.create({
      data: { name: 'Test Burger', category: 'FOOD', price: 15.0, isAvailable: true },
    });

    // Create an order in SERVED status (eligible for payment)
    const clientOrderId = uuid();
    const order = await p.order.create({
      data: {
        clientOrderId,
        tableNumber: 'T5',
        waiterId: waiter.id,
        items: [{ menuItemId: menuItem.id, name: menuItem.name, unitPrice: menuItem.price, quantity: 2, notes: '' }],
        totalAmount: 30.0,
        status: OrderStatus.SERVED,
      },
    });

    // Fire two concurrent payments
    const [res1, res2] = await Promise.all([
      request(app)
        .patch(`/api/orders/${order.id}/pay`)
        .set('Authorization', `Bearer ${cashier1.accessToken}`)
        .send({ paymentMethod: 'CASH' }),
      request(app)
        .patch(`/api/orders/${order.id}/pay`)
        .set('Authorization', `Bearer ${cashier2.accessToken}`)
        .send({ paymentMethod: 'CARD' }),
    ]);

    const statuses = [res1.status, res2.status].sort();

    // Exactly one 200 and one 409
    expect(statuses).toEqual([200, 409]);

    // Verify final DB state — only the winner's data persists
    const finalOrder = await p.order.findUnique({ where: { id: order.id } });
    expect(finalOrder).not.toBeNull();
    expect(finalOrder!.status).toBe(OrderStatus.PAID);
    expect(finalOrder!.isPaid).toBe(true);

    // The cashierId should match the winner
    const winner = res1.status === 200 ? cashier1 : cashier2;
    expect(finalOrder!.cashierId).toBe(winner.id);

    // paymentMethod should match the winner
    const expectedMethod = res1.status === 200 ? 'CASH' : 'CARD';
    expect(finalOrder!.paymentMethod).toBe(expectedMethod);
  });
});

// ---------------------------------------------------------------------------
// Idempotent order creation
// ---------------------------------------------------------------------------
describe('Idempotent order creation (§2.1)', () => {
  it('POSTing the same clientOrderId twice creates only one document', async () => {
    const p = getPrisma();
    const waiter = await seedTestUser({ role: 'WAITER' as any, email: 'idem-waiter@pos.com' });

    const menuItem = await p.menuItem.create({
      data: { name: 'Idempotent Burger', category: 'FOOD', price: 12.0, isAvailable: true },
    });

    const clientOrderId = uuid();
    const body = {
      clientOrderId,
      tableNumber: 'T3',
      items: [{ menuItemId: menuItem.id, name: menuItem.name, unitPrice: menuItem.price, quantity: 1 }],
    };

    // First submission
    const res1 = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${waiter.accessToken}`)
      .send(body);
    expect(res1.status).toBe(201);
    expect(res1.body.isNew).toBe(true);

    // Second submission (same clientOrderId — simulating Background Sync retry)
    const res2 = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${waiter.accessToken}`)
      .send(body);
    expect(res2.status).toBe(200);
    expect(res2.body.isNew).toBe(false);

    // Only one document in DB
    const orders = await p.order.findMany({ where: { clientOrderId } });
    expect(orders).toHaveLength(1);
  });
});
