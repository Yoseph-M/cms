/**
 * RBAC Matrix Integration Test — Phase 3, §2.1
 *
 * A single parameterized test file that, for every route in the API contract,
 * asserts each of the roles gets the expected 200/403. This catches the
 * "someone added a new route and forgot the middleware" class of bug.
 *
 * For routes that require specific body data or path params, we provide
 * minimal valid payloads so the test reaches the auth/role layer rather than
 * failing at validation.
 */
import request from 'supertest';
import { Role } from '@prisma/client';
import { getTestApp, getPrisma, seedTestUser, cleanDb, disconnectPrisma } from './helpers';
import crypto from 'crypto';

const uuid = () => crypto.randomUUID();

const app = getTestApp();

// ---------------------------------------------------------------------------
// Route definitions with expected role access
// ---------------------------------------------------------------------------
interface RouteSpec {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  /** Roles that SHOULD be allowed (200/201/400/404 but NOT 401/403) */
  allowedRoles: Role[];
  /** Optional body for POST/PATCH/PUT requests */
  body?: Record<string, any> | (() => Record<string, any>);
  /** If true, the path contains :id which must be replaced with a real ObjectId-shaped string */
  needsId?: boolean;
  /** Description for test output */
  description?: string;
}

// A fake but valid-looking MongoDB ObjectId for path params
const fakeId = '507f1f77bcf86cd799439011';

const ALL_ROLES: Role[] = [Role.OWNER, Role.MANAGER, Role.CASHIER, Role.WAITER];

const ROUTE_SPECS: RouteSpec[] = [
  // --- Auth routes (no auth required, skip RBAC) ---
  // Auth is covered in auth.test.ts

  // --- Users ---
  {
    method: 'GET',
    path: '/api/users',
    allowedRoles: [Role.OWNER, Role.MANAGER],
    description: 'List users',
  },
  {
    method: 'POST',
    path: '/api/users',
    allowedRoles: [Role.OWNER, Role.MANAGER],
    body: () => ({
      name: 'RBAC Test User',
      role: 'WAITER',
      phone: `+1555${Date.now().toString().slice(-7)}`,
      password: 'testpass123',
    }),
    description: 'Create user',
  },
  {
    method: 'PATCH',
    path: `/api/users/${fakeId}`,
    allowedRoles: [Role.OWNER, Role.MANAGER],
    body: { name: 'Updated Name' },
    description: 'Update user',
  },
  {
    method: 'PATCH',
    path: `/api/users/${fakeId}/deactivate`,
    allowedRoles: [Role.OWNER, Role.MANAGER],
    description: 'Deactivate user',
  },
  {
    method: 'PATCH',
    path: `/api/users/${fakeId}/reset-password`,
    allowedRoles: [Role.OWNER, Role.MANAGER],
    body: { password: 'newpassword123' },
    description: 'Reset password',
  },
  {
    method: 'POST',
    path: `/api/users/${fakeId}/unlock`,
    allowedRoles: [Role.OWNER, Role.MANAGER],
    description: 'Unlock user',
  },

  // --- Menu ---
  {
    method: 'GET',
    path: '/api/menu',
    allowedRoles: ALL_ROLES, // All authenticated users can view menu
    description: 'List menu items',
  },
  {
    method: 'POST',
    path: '/api/menu',
    allowedRoles: [Role.OWNER, Role.MANAGER],
    body: { name: 'Test Item', category: 'FOOD', price: 1000 }, // 10.00 in minor units
    description: 'Create menu item',
  },
  {
    method: 'PATCH',
    path: `/api/menu/${fakeId}`,
    allowedRoles: [Role.OWNER, Role.MANAGER],
    body: { name: 'Updated Item' },
    description: 'Update menu item',
  },
  {
    method: 'PATCH',
    path: `/api/menu/${fakeId}/availability`,
    allowedRoles: [Role.OWNER, Role.MANAGER],
    body: { isAvailable: false },
    description: 'Toggle menu availability',
  },
  {
    method: 'DELETE',
    path: `/api/menu/${fakeId}`,
    allowedRoles: [Role.OWNER, Role.MANAGER],
    description: 'Delete menu item',
  },

  // --- Orders ---
  {
    method: 'POST',
    path: '/api/orders',
    allowedRoles: [Role.WAITER],
    body: () => ({
      clientOrderId: uuid(),
      tableNumber: 'T1',
      items: [{ menuItemId: fakeId, name: 'Test', unitPrice: 10, quantity: 1 }],
    }),
    description: 'Create order',
  },
  {
    method: 'GET',
    path: '/api/orders',
    allowedRoles: ALL_ROLES, // All can see (waiters filtered to own)
    description: 'List orders',
  },
  {
    method: 'GET',
    path: `/api/orders/${fakeId}`,
    allowedRoles: ALL_ROLES,
    description: 'Get order by ID',
  },
  {
    method: 'PATCH',
    path: `/api/orders/${fakeId}/status`,
    allowedRoles: [Role.CASHIER, Role.MANAGER, Role.OWNER],
    body: { status: 'IN_KITCHEN' },
    description: 'Update order status',
  },
  {
    method: 'POST',
    path: `/api/orders/${fakeId}/settlements`,
    allowedRoles: [Role.CASHIER, Role.MANAGER, Role.OWNER],
    body: { amountMinor: 10000, method: 'CASH', reference: '', note: '' },
    description: 'Record settlement (payment)',
  },
  {
    method: 'POST',
    path: `/api/orders/${fakeId}/cancellation-request`,
    allowedRoles: [Role.WAITER, Role.CASHIER, Role.MANAGER, Role.OWNER],
    body: { reason: 'Customer changed mind' },
    description: 'Request order cancellation',
  },
  {
    method: 'POST',
    path: `/api/orders/${fakeId}/reprint`,
    allowedRoles: [Role.CASHIER, Role.MANAGER, Role.OWNER],
    description: 'Reprint order',
  },

  // --- Cancellation Requests ---
  {
    method: 'GET',
    path: '/api/cancellation-requests',
    allowedRoles: [Role.WAITER, Role.CASHIER, Role.MANAGER, Role.OWNER],
    description: 'List cancellation requests',
  },
  {
    method: 'GET',
    path: `/api/cancellation-requests/${fakeId}`,
    allowedRoles: [Role.WAITER, Role.CASHIER, Role.MANAGER, Role.OWNER],
    description: 'Get cancellation request',
  },
  {
    method: 'PATCH',
    path: `/api/cancellation-requests/${fakeId}/approve`,
    allowedRoles: [Role.MANAGER, Role.OWNER],
    description: 'Approve cancellation request',
  },
  {
    method: 'PATCH',
    path: `/api/cancellation-requests/${fakeId}/reject`,
    allowedRoles: [Role.MANAGER, Role.OWNER],
    body: { reason: 'Not valid' },
    description: 'Reject cancellation request',
  },

  // --- Attendance ---
  {
    method: 'GET',
    path: '/api/attendance',
    allowedRoles: [Role.OWNER, Role.MANAGER],
    description: 'List attendance',
  },
  {
    method: 'POST',
    path: '/api/attendance',
    allowedRoles: [Role.OWNER, Role.MANAGER],
    body: { userId: fakeId, date: '2026-01-15', status: 'PRESENT' },
    description: 'Create attendance',
  },
  {
    method: 'PATCH',
    path: `/api/attendance/${fakeId}`,
    allowedRoles: [Role.OWNER, Role.MANAGER],
    body: { status: 'ABSENT' },
    description: 'Update attendance',
  },

  // --- Payroll ---
  {
    method: 'GET',
    path: '/api/payroll',
    allowedRoles: [Role.OWNER, Role.MANAGER],
    description: 'List payroll history',
  },
  {
    method: 'GET',
    path: `/api/payroll/staff-ref/${fakeId}`,
    allowedRoles: [Role.OWNER, Role.MANAGER],
    description: 'Staff payroll reference',
  },
  {
    method: 'POST',
    path: '/api/payroll/entries',
    allowedRoles: [Role.OWNER, Role.MANAGER],
    body: { userId: fakeId, periodMonth: 1, periodYear: 2026, paidAmount: 1000 },
    description: 'Record payroll entry',
  },

  // --- Expenses ---
  {
    method: 'GET',
    path: '/api/expenses',
    allowedRoles: [Role.OWNER, Role.MANAGER],
    description: 'List expenses',
  },
  {
    method: 'POST',
    path: '/api/expenses',
    allowedRoles: [Role.OWNER, Role.MANAGER],
    body: { category: 'RENT', amount: 5000, description: 'Monthly rent', date: '2026-01-01' },
    description: 'Create expense',
  },

  // --- Notifications ---
  {
    method: 'GET',
    path: '/api/notifications',
    allowedRoles: [Role.OWNER, Role.MANAGER],
    description: 'List notifications',
  },

  // --- Analytics ---
  {
    method: 'GET',
    path: '/api/analytics/sales/daily',
    allowedRoles: [Role.OWNER, Role.MANAGER],
    description: 'Daily sales',
  },
  {
    method: 'GET',
    path: '/api/analytics/sales/monthly',
    allowedRoles: [Role.OWNER, Role.MANAGER],
    description: 'Monthly sales',
  },
  {
    method: 'GET',
    path: '/api/analytics/top-items',
    allowedRoles: [Role.OWNER, Role.MANAGER],
    description: 'Top items',
  },
  {
    method: 'GET',
    path: '/api/analytics/profit-loss',
    allowedRoles: [Role.OWNER, Role.MANAGER],
    description: 'Profit and loss',
  },
  {
    method: 'GET',
    path: '/api/analytics/staff-performance',
    allowedRoles: [Role.OWNER, Role.MANAGER],
    description: 'Staff performance',
  },

  // --- Printers (Settings) ---
  {
    method: 'GET',
    path: '/api/settings/printers',
    allowedRoles: [Role.OWNER, Role.MANAGER],
    description: 'Get printers',
  },
  {
    method: 'POST',
    path: '/api/settings/printers',
    allowedRoles: [Role.OWNER],
    body: { stations: [{ station: 'kitchen', ip: '192.168.1.100', port: 9100 }] },
    description: 'Update printers (Owner only)',
  },
];

// ---------------------------------------------------------------------------
// Test execution
// ---------------------------------------------------------------------------
describe('RBAC Matrix (§2.1)', () => {
  // Pre-create one token per role for all tests
  const tokens: Record<string, string> = {};

  beforeAll(async () => {
    await cleanDb();
    for (const role of ALL_ROLES) {
      const user = await seedTestUser({
        role,
        email: `rbac-${role.toLowerCase()}@pos.com`,
        name: `RBAC ${role}`,
      });
      tokens[role] = user.accessToken;
    }
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  for (const spec of ROUTE_SPECS) {
    describe(`${spec.method} ${spec.path} — ${spec.description || ''}`, () => {
      for (const role of ALL_ROLES) {
        const isAllowed = spec.allowedRoles.includes(role);

        it(`${role} should get ${isAllowed ? 'access (not 403)' : '403'}`, async () => {
          const body = typeof spec.body === 'function' ? spec.body() : spec.body;

          let req: request.Test;
          switch (spec.method) {
            case 'GET':
              req = request(app).get(spec.path);
              break;
            case 'POST':
              req = request(app).post(spec.path);
              break;
            case 'PATCH':
              req = request(app).patch(spec.path);
              break;
            case 'DELETE':
              req = request(app).delete(spec.path);
              break;
          }

          req = req.set('Authorization', `Bearer ${tokens[role]}`);
          if (body) {
            req = req.send(body);
          }

          const res = await req;

          if (isAllowed) {
            // Should NOT be 401 or 403
            expect([401, 403]).not.toContain(res.status);
          } else {
            // Must be exactly 403
            expect(res.status).toBe(403);
          }
        });
      }
    });
  }

  // --- §3: Role escalation test ---
  // Manager JWT fires at every Owner-only route and asserts 403
  describe('Role escalation: Manager → Owner-only routes (§3)', () => {
    const ownerOnlyRoutes = ROUTE_SPECS.filter(
      (s) => s.allowedRoles.includes(Role.OWNER) && !s.allowedRoles.includes(Role.MANAGER)
    );

    for (const spec of ownerOnlyRoutes) {
      it(`Manager should be blocked from ${spec.method} ${spec.path}`, async () => {
        const body = typeof spec.body === 'function' ? spec.body() : spec.body;
        let req: request.Test;
        switch (spec.method) {
          case 'GET':
            req = request(app).get(spec.path);
            break;
          case 'POST':
            req = request(app).post(spec.path);
            break;
          case 'PATCH':
            req = request(app).patch(spec.path);
            break;
          case 'DELETE':
            req = request(app).delete(spec.path);
            break;
        }
        req = req.set('Authorization', `Bearer ${tokens[Role.MANAGER]}`);
        if (body) req = req.send(body);
        const res = await req;
        expect(res.status).toBe(403);
      });
    }
  });

  // Unauthenticated access should always be 401
  describe('Unauthenticated access returns 401', () => {
    for (const spec of ROUTE_SPECS) {
      it(`${spec.method} ${spec.path} without token → 401`, async () => {
        const body = typeof spec.body === 'function' ? spec.body() : spec.body;
        let req: request.Test;
        switch (spec.method) {
          case 'GET':
            req = request(app).get(spec.path);
            break;
          case 'POST':
            req = request(app).post(spec.path);
            break;
          case 'PATCH':
            req = request(app).patch(spec.path);
            break;
          case 'DELETE':
            req = request(app).delete(spec.path);
            break;
        }
        if (body) req = req.send(body);
        const res = await req;
        expect(res.status).toBe(401);
      });
    }
  });
});
