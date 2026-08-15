# Authenticated Test Users Guide

Centralized helpers for creating authenticated users in tests.

## Overview

Three approaches for creating authenticated test users:

1. **`seedTestUser()`** - Legacy function, still supported
2. **`createAuthenticatedUser()`** - New recommended approach
3. **`createTestUsers()`** - Create all roles at once
4. **`generateTokensForUser()`** - Add tokens to factory-created users

## Quick Start

### Option 1: Create All Roles at Once (Recommended for Integration Tests)

```typescript
import { getPrisma, createTestUsers, getTestApp, cleanDb } from './helpers';

const app = getTestApp();
const prisma = getPrisma();

beforeEach(async () => {
  await cleanDb();
});

describe('Order Management', () => {
  it('allows authenticated users to create orders', async () => {
    const users = await createTestUsers({ prisma });

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${users.waiter.accessToken}`)
      .send({...});

    expect(res.status).toBe(201);
  });
});
```

**Returns**:
```typescript
{
  owner: TestUser,    // owner@test.com, Role.OWNER
  manager: TestUser,  // manager@test.com, Role.MANAGER
  cashier: TestUser,  // cashier@test.com, Role.CASHIER
  waiter: TestUser,   // waiter@test.com, Role.WAITER
}
```

### Option 2: Create Individual User (Recommended for Focused Tests)

```typescript
import { getPrisma, createAuthenticatedUser } from './helpers';
import { Role } from '@prisma/client';

const prisma = getPrisma();

it('cashier can record settlement', async () => {
  const cashier = await createAuthenticatedUser({ prisma }, {
    role: Role.CASHIER,
    email: 'cashier@test.com',
  });

  const res = await request(app)
    .post(`/api/orders/${orderId}/settlements`)
    .set('Authorization', `Bearer ${cashier.accessToken}`)
    .send({...});

  expect(res.status).toBe(201);
});
```

### Option 3: Use with Factories (Advanced)

```typescript
import { getPrisma, generateTokensForUser } from './helpers';
import * as factories from './factories';

const prisma = getPrisma();

it('waiter can create order with factory-created menu items', async () => {
  // Create user via factory
  const waiter = await factories.createUser({ prisma }, {
    role: Role.WAITER,
    email: 'waiter@test.com',
  });

  // Generate tokens
  const tokens = generateTokensForUser(waiter);

  // Create menu item via factory
  const burger = await factories.createMenuItem({ prisma }, {
    name: 'Burger',
    price: 1500,
  });

  // Make authenticated request
  const res = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${tokens.accessToken}`)
    .send({
      tableNumber: 'T1',
      items: [{
        menuItemId: burger.id,
        name: burger.name,
        unitPrice: burger.price,
        quantity: 1,
      }],
    });

  expect(res.status).toBe(201);
});
```

### Option 4: Legacy `seedTestUser` (Backward Compatible)

```typescript
import { seedTestUser } from './helpers';

it('owner can view analytics', async () => {
  const owner = await seedTestUser({ role: 'OWNER' as any });

  const res = await request(app)
    .get('/api/analytics/daily-sales')
    .set('Authorization', `Bearer ${owner.accessToken}`);

  expect(res.status).toBe(200);
});
```

## API Reference

### createTestUsers()

Creates a standard set of all four roles with predefined emails.

```typescript
const users = await createTestUsers({ prisma });
```

**Returns**:
```typescript
{
  owner: {
    id: string,
    name: 'Test Owner',
    role: Role.OWNER,
    email: 'owner@test.com',
    phone: string,
    accessToken: string,
    refreshToken: string,
  },
  manager: { ... },  // manager@test.com
  cashier: { ... },  // cashier@test.com
  waiter: { ... },   // waiter@test.com
}
```

**Use when**:
- Testing RBAC (need multiple roles)
- Integration tests requiring full team
- Tests that span multiple user interactions

### createAuthenticatedUser()

Creates a single user with custom properties and authentication tokens.

```typescript
const cashier = await createAuthenticatedUser({ prisma }, {
  name: 'John Doe',
  role: Role.CASHIER,
  email: 'john@test.com',
  phone: '+15551234567',
  salaryAmount: 3500,
});
```

**Parameters**:
- `name` (optional): User's display name (default: "Test User")
- `role` (optional): User role (default: Role.CASHIER)
- `email` (optional): Email address (default: generated unique email)
- `phone` (optional): Phone number (default: generated unique phone)
- `salaryAmount` (optional): Monthly salary (default: 3000)

**Returns**: `TestUser` with `accessToken` and `refreshToken`

**Use when**:
- Testing specific role behavior
- Need custom user properties
- Single-role test scenarios

### generateTokensForUser()

Generates authentication tokens for an existing user (typically from factories).

```typescript
const user = await factories.createUser({ prisma }, {
  role: Role.WAITER,
});

const tokens = generateTokensForUser(user);

// Use tokens.accessToken in requests
```

**Parameters**:
```typescript
{
  id: string,
  role: Role,
  name: string,
  email?: string | null,
}
```

**Returns**:
```typescript
{
  accessToken: string,
  refreshToken: string,
}
```

**Use when**:
- Using factories to create users
- Need separation between user creation and authentication
- Testing authentication edge cases

### seedTestUser() (Legacy)

Original helper function, still supported for backward compatibility.

```typescript
const owner = await seedTestUser({
  name: 'Test Owner',
  role: 'OWNER' as any,
  email: 'owner@test.com',
  phone: '+15551234567',
});
```

**Note**: New tests should use `createAuthenticatedUser()` instead.

## Test User Properties

All authenticated user functions return a `TestUser` object:

```typescript
interface TestUser {
  id: string;           // Database ID
  name: string;         // Display name
  role: Role;           // OWNER | MANAGER | CASHIER | WAITER
  email: string;        // Email address
  phone: string;        // Phone number
  accessToken: string;  // JWT access token (use in Authorization header)
  refreshToken: string; // JWT refresh token
}
```

## Common Patterns

### Pattern 1: RBAC Testing

```typescript
describe('RBAC: Order Cancellation', () => {
  let users: any;

  beforeEach(async () => {
    await cleanDb();
    users = await createTestUsers({ prisma });
  });

  it('allows MANAGER to approve cancellation', async () => {
    const res = await request(app)
      .patch(`/api/cancellation-requests/${requestId}/approve`)
      .set('Authorization', `Bearer ${users.manager.accessToken}`);

    expect(res.status).toBe(200);
  });

  it('denies WAITER from approving cancellation', async () => {
    const res = await request(app)
      .patch(`/api/cancellation-requests/${requestId}/approve`)
      .set('Authorization', `Bearer ${users.waiter.accessToken}`);

    expect(res.status).toBe(403);
  });
});
```

### Pattern 2: Role-Specific Workflows

```typescript
describe('Cashier Settlement Workflow', () => {
  let cashier: TestUser;
  let waiter: TestUser;

  beforeEach(async () => {
    await cleanDb();
    cashier = await createAuthenticatedUser({ prisma }, { role: Role.CASHIER });
    waiter = await createAuthenticatedUser({ prisma }, { role: Role.WAITER });
  });

  it('allows cashier to record payment for waiter order', async () => {
    // Waiter creates order
    const orderRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${waiter.accessToken}`)
      .send({...});

    // Cashier records settlement
    const settlementRes = await request(app)
      .post(`/api/orders/${orderRes.body.id}/settlements`)
      .set('Authorization', `Bearer ${cashier.accessToken}`)
      .send({
        amountMinor: 10000,
        method: 'CASH',
      });

    expect(settlementRes.status).toBe(201);
  });
});
```

### Pattern 3: Factory Integration

```typescript
describe('Settlement with Factories', () => {
  it('creates settled order with proper audit trail', async () => {
    // Create users via factory
    const waiter = await factories.createUser({ prisma }, { role: Role.WAITER });
    const cashier = await factories.createUser({ prisma }, { role: Role.CASHIER });

    // Generate tokens
    const waiterTokens = generateTokensForUser(waiter);
    const cashierTokens = generateTokensForUser(cashier);

    // Create order via API (as waiter)
    const orderRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${waiterTokens.accessToken}`)
      .send({...});

    // Record settlement via API (as cashier)
    const settlementRes = await request(app)
      .post(`/api/orders/${orderRes.body.id}/settlements`)
      .set('Authorization', `Bearer ${cashierTokens.accessToken}`)
      .send({ amountMinor: 10000, method: 'CASH' });

    // Verify audit trail
    const settlement = await prisma.settlement.findFirst({
      where: { orderId: orderRes.body.id },
    });
    expect(settlement?.recordedById).toBe(cashier.id);
  });
});
```

### Pattern 4: Concurrent Operations

```typescript
describe('Concurrent Settlement Attempts', () => {
  it('prevents double-payment by different cashiers', async () => {
    const [cashier1, cashier2] = await Promise.all([
      createAuthenticatedUser({ prisma }, { role: Role.CASHIER, email: 'c1@test.com' }),
      createAuthenticatedUser({ prisma }, { role: Role.CASHIER, email: 'c2@test.com' }),
    ]);

    // Both try to settle same order
    const [res1, res2] = await Promise.all([
      request(app)
        .post(`/api/orders/${orderId}/settlements`)
        .set('Authorization', `Bearer ${cashier1.accessToken}`)
        .send({ amountMinor: 10000, method: 'CASH' }),
      request(app)
        .post(`/api/orders/${orderId}/settlements`)
        .set('Authorization', `Bearer ${cashier2.accessToken}`)
        .send({ amountMinor: 10000, method: 'CARD' }),
    ]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([201, 409]); // One succeeds, one conflicts
  });
});
```

## Best Practices

### 1. Use `createTestUsers()` for RBAC Tests

When testing role-based access control, create all roles upfront:

```typescript
// ✅ Good
const users = await createTestUsers({ prisma });
await testEndpoint(users.owner, 200);
await testEndpoint(users.manager, 200);
await testEndpoint(users.cashier, 403);
await testEndpoint(users.waiter, 403);

// ❌ Avoid
const owner = await createAuthenticatedUser({ prisma }, { role: Role.OWNER });
const manager = await createAuthenticatedUser({ prisma }, { role: Role.MANAGER });
const cashier = await createAuthenticatedUser({ prisma }, { role: Role.CASHIER });
const waiter = await createAuthenticatedUser({ prisma }, { role: Role.WAITER });
```

### 2. Use `createAuthenticatedUser()` for Single-Role Tests

When testing specific role behavior, only create what you need:

```typescript
// ✅ Good - only creates what's needed
describe('Cashier Dashboard', () => {
  let cashier: TestUser;

  beforeEach(async () => {
    cashier = await createAuthenticatedUser({ prisma }, { role: Role.CASHIER });
  });

  it('shows pending settlements', async () => {
    const res = await request(app)
      .get('/api/orders?status=SERVED')
      .set('Authorization', `Bearer ${cashier.accessToken}`);
    expect(res.status).toBe(200);
  });
});

// ❌ Avoid - creates unnecessary users
const users = await createTestUsers({ prisma });
const res = await request(app)
  .get('/api/orders')
  .set('Authorization', `Bearer ${users.cashier.accessToken}`);
```

### 3. Reuse Authentication in beforeEach

```typescript
describe('Order API', () => {
  let waiter: TestUser;
  let cashier: TestUser;

  beforeEach(async () => {
    await cleanDb();
    waiter = await createAuthenticatedUser({ prisma }, { role: Role.WAITER });
    cashier = await createAuthenticatedUser({ prisma }, { role: Role.CASHIER });
  });

  it('test 1', async () => {
    // Use waiter.accessToken
  });

  it('test 2', async () => {
    // Use cashier.accessToken
  });
});
```

### 4. Use Descriptive Emails for Debugging

```typescript
const cashier = await createAuthenticatedUser({ prisma }, {
  role: Role.CASHIER,
  email: 'settlement-test-cashier@test.com', // Descriptive!
});
```

### 5. Combine with Factories for Complex Scenarios

```typescript
// Create scenario via factory
const scenario = await factories.createTestScenario({ prisma }, {
  includeMenuItems: true,
  includeOrders: true,
});

// Add authentication
const ownerTokens = generateTokensForUser(scenario.owner);
const cashierTokens = generateTokensForUser(scenario.cashier);

// Use in API tests
const res = await request(app)
  .get('/api/analytics/daily-sales')
  .set('Authorization', `Bearer ${ownerTokens.accessToken}`);
```

## Migration Guide

### From `seedTestUser`

**Old**:
```typescript
const owner = await seedTestUser({ role: 'OWNER' as any });
const cashier = await seedTestUser({ role: 'CASHIER' as any });
```

**New**:
```typescript
const users = await createTestUsers({ prisma });
// Use users.owner and users.cashier
```

### From Inline User Creation

**Old**:
```typescript
const user = await prisma.user.create({
  data: {
    name: 'Test',
    role: Role.CASHIER,
    email: 'test@test.com',
    phone: '+1234567890',
    passwordHash: await hashPassword('password'),
    salaryAmount: 3000,
  },
});
const token = generateAccessToken({ userId: user.id, ... });
```

**New**:
```typescript
const cashier = await createAuthenticatedUser({ prisma }, {
  role: Role.CASHIER,
  email: 'test@test.com',
});
// Use cashier.accessToken directly
```

## Troubleshooting

### Issue: "Unique constraint violation on email"

**Cause**: Reusing same email across tests without `cleanDb()`

**Solution**:
```typescript
beforeEach(async () => {
  await cleanDb(); // Always clean between tests!
});
```

### Issue: "401 Unauthorized"

**Cause**: Forgot to set Authorization header

**Solution**:
```typescript
.set('Authorization', `Bearer ${user.accessToken}`)
```

### Issue: "403 Forbidden"

**Cause**: User role doesn't have permission

**Solution**: Check RBAC rules and use correct role

```typescript
// Settlements require CASHIER, MANAGER, or OWNER
const cashier = await createAuthenticatedUser({ prisma }, { role: Role.CASHIER });
```

