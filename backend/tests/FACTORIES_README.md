# Test Data Factories

Canonical factories for creating test data with sensible defaults and Phase 8 conventions.

## Philosophy

1. **Explicit over Implicit**: Required fields must be explicitly provided
2. **Sensible Defaults**: Optional fields have reasonable defaults
3. **Phase 8 Compliant**: All money in minor units, settlementStatus over isPaid
4. **Type Safe**: Full TypeScript support with option interfaces
5. **Composable**: Factories can be combined to create complex scenarios

## Usage

### Basic Usage

```typescript
import { getPrisma } from './helpers';
import * as factories from './factories';

const prisma = getPrisma();
const factory = { prisma };

// Create a user
const cashier = await factories.createUser(factory, {
  role: Role.CASHIER,
  email: 'cashier@test.com',
});

// Create a menu item
const burger = await factories.createMenuItem(factory, {
  name: 'Burger',
  category: 'FOOD',
  price: 1500, // $15.00 in minor units
});

// Create an order
const order = await factories.createOrder(factory, {
  waiterId: waiter.id,
  items: [{
    menuItemId: burger.id,
    name: burger.name,
    unitPrice: burger.price,
    quantity: 2,
  }],
});
```

### Complete Test Scenario

```typescript
// Create a full test environment
const scenario = await factories.createTestScenario(factory, {
  includeMenuItems: true,
  includeOrders: true,
  includeSettlements: true,
  includePrinters: true,
});

// scenario contains:
// - owner, manager, cashier, waiter (users)
// - menuItems (array of 3 items)
// - orders (array of 2 orders)
// - settlements (array of 1 settlement)
// - printers (array of 3 printers)
```

### Settled Order

```typescript
// Create an order that's already paid
const { order, settlement } = await factories.createSettledOrder(factory, {
  waiterId: waiter.id,
  settlementRecordedById: cashier.id,
  settlementMethod: 'CASH',
  items: [{
    menuItemId: burger.id,
    name: burger.name,
    unitPrice: 1500,
    quantity: 2,
  }],
});

// order.status === OrderStatus.PAID
// order.settlementStatus === SettlementStatus.FULLY_SETTLED
// settlement.amountMinor === 3000 (matches order.totalAmount)
```

## Available Factories

### createUser

Creates a user with authentication credentials.

```typescript
const user = await factories.createUser(factory, {
  name: 'John Doe',
  role: Role.CASHIER,
  email: 'john@test.com',
  phone: '+15551234567',
  salaryAmount: 3000, // Optional
});
```

**Defaults**:
- `name`: "Test User {timestamp}"
- `role`: CASHIER
- `email`: Generated unique email
- `phone`: Generated unique phone
- `salaryAmount`: 3000
- `passwordHash`: Hash of "password123"

### createMenuItem

Creates a menu item.

```typescript
const item = await factories.createMenuItem(factory, {
  name: 'Espresso',
  category: 'BEVERAGE',
  price: 500, // $5.00 in minor units
  isAvailable: true,
});
```

**Defaults**:
- `name`: "Test Item {timestamp}"
- `category`: 'FOOD'
- `price`: 1500 ($15.00)
- `isAvailable`: true

### createOrder

Creates an order.

```typescript
const order = await factories.createOrder(factory, {
  waiterId: waiter.id, // REQUIRED
  cashierId: cashier.id, // Optional
  tableNumber: 'T5',
  items: [
    {
      menuItemId: burger.id,
      name: 'Burger',
      unitPrice: 1500,
      quantity: 2,
      notes: 'No onions',
    },
  ],
  status: OrderStatus.SERVED,
  settlementStatus: SettlementStatus.UNSETTLED,
});
```

**Required**:
- `waiterId`

**Defaults**:
- `clientOrderId`: Generated UUID
- `tableNumber`: Random "T{1-20}"
- `items`: Single test item (1000 minor units)
- `totalAmount`: Calculated from items
- `status`: SUBMITTED
- `settlementStatus`: UNSETTLED

### createSettlement

Creates a settlement (payment record).

```typescript
const settlement = await factories.createSettlement(factory, {
  orderId: order.id, // REQUIRED
  recordedById: cashier.id, // REQUIRED
  amountMinor: 1500, // $15.00
  method: 'CARD',
  reference: 'RCPT-001',
  note: 'Customer paid with Visa',
  recordedAt: new Date(),
  idempotencyKey: 'unique-key-123',
});
```

**Required**:
- `orderId`
- `recordedById`

**Defaults**:
- `amountMinor`: 1000 ($10.00)
- `method`: 'CASH'
- `reference`: ''
- `note`: ''
- `recordedAt`: Current date

### createSettledOrder

Creates an order with a matching settlement (convenience).

```typescript
const { order, settlement } = await factories.createSettledOrder(factory, {
  waiterId: waiter.id, // REQUIRED
  settlementRecordedById: cashier.id, // REQUIRED
  settlementMethod: 'MOBILE',
  items: [...],
});
```

Automatically sets:
- `order.status` = PAID
- `order.settlementStatus` = FULLY_SETTLED
- `settlement.amountMinor` = order.totalAmount

### createCancellationRequest

Creates a cancellation request.

```typescript
const request = await factories.createCancellationRequest(factory, {
  orderId: order.id, // REQUIRED
  requestedById: waiter.id, // REQUIRED
  reason: 'Customer changed mind',
  status: 'PENDING',
});
```

**Required**:
- `orderId`
- `requestedById`

**Defaults**:
- `reason`: 'Test cancellation'
- `status`: 'PENDING'

### createExpense

Creates an expense record.

```typescript
const expense = await factories.createExpense(factory, {
  recordedById: owner.id, // REQUIRED
  category: 'RENT',
  amount: 150000, // $1500.00 in minor units
  description: 'Monthly rent',
  date: new Date('2026-06-01'),
});
```

**Required**:
- `recordedById`

**Defaults**:
- `category`: 'SUPPLIES'
- `amount`: 5000 ($50.00)
- `description`: 'Test expense'
- `date`: Current date

### createAttendance

Creates an attendance record.

```typescript
const attendance = await factories.createAttendance(factory, {
  userId: waiter.id, // REQUIRED
  date: new Date('2026-06-15'),
  status: 'PRESENT',
  notes: 'On time',
});
```

**Required**:
- `userId`

**Defaults**:
- `date`: Current date
- `status`: 'PRESENT'
- `notes`: ''

### createPayrollEntry

Creates a payroll payment entry.

```typescript
const payment = await factories.createPayrollEntry(factory, {
  userId: waiter.id, // REQUIRED
  processedById: owner.id, // REQUIRED
  periodMonth: 6,
  periodYear: 2026,
  baseSalary: 300000, // $3000.00
  bonuses: 10000,
  deductions: 5000,
});
```

**Required**:
- `userId`
- `processedById`
- `periodMonth`
- `periodYear`

**Defaults**:
- `baseSalary`: 300000 ($3000.00)
- `bonuses`: 0
- `deductions`: 0
- `paidAmount`: Calculated (base + bonuses - deductions)
- `paymentDate`: Current date

### createSystemSetting

Creates a system setting.

```typescript
const setting = await factories.createSystemSetting(factory, {
  key: 'CASHIER_ORDERING_ENABLED', // REQUIRED
  value: 'true',
  description: 'Allow cashiers to create orders',
});
```

**Required**:
- `key`

**Defaults**:
- `value`: 'test-value'
- `description`: ''

### createPrinterStation

Creates a printer station.

```typescript
const printer = await factories.createPrinterStation(factory, {
  station: 'KITCHEN',
  ip: '192.168.1.10',
  port: 9100,
  isOnline: true,
});
```

**Defaults**:
- `station`: 'KITCHEN'
- `ip`: '192.168.1.100'
- `port`: 9100
- `isOnline`: true

### createTestScenario

Creates a complete test environment with all common entities.

```typescript
const scenario = await factories.createTestScenario(factory, {
  includeMenuItems: true,
  includeOrders: true,
  includeSettlements: true,
  includePrinters: true,
});

// Returns:
{
  owner: User,
  manager: User,
  cashier: User,
  waiter: User,
  menuItems?: MenuItem[],
  orders?: Order[],
  settlements?: Settlement[],
  printers?: PrinterStation[],
}
```

## Best Practices

### 1. Use Factories in Every Test

**Don't**:
```typescript
await prisma.order.create({
  data: {
    clientOrderId: 'test-123',
    tableNumber: 'T1',
    waiterId: waiter.id,
    items: [...],
    totalAmount: 3000,
    status: 'PAID',
    isPaid: true, // WRONG - deprecated field
    paymentMethod: 'CASH', // WRONG - deprecated field
  },
});
```

**Do**:
```typescript
const { order, settlement } = await factories.createSettledOrder(factory, {
  waiterId: waiter.id,
  settlementRecordedById: cashier.id,
  items: [...],
});
```

### 2. Only Override What You Test

```typescript
// Testing table assignment? Only override tableNumber
const order = await factories.createOrder(factory, {
  waiterId: waiter.id,
  tableNumber: 'VIP-1', // Only what matters for this test
});

// Everything else uses sensible defaults
```

### 3. Use createTestScenario for Setup

```typescript
describe('Order Management', () => {
  let scenario: any;

  beforeEach(async () => {
    await cleanDb();
    scenario = await factories.createTestScenario(factory, {
      includeMenuItems: true,
    });
  });

  it('allows waiter to create order', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${scenario.waiter.accessToken}`)
      .send({...});
    
    expect(res.status).toBe(201);
  });
});
```

### 4. Combine Factories for Complex Scenarios

```typescript
// Create a partially paid order
const order = await factories.createOrder(factory, {
  waiterId: waiter.id,
  totalAmount: 10000, // $100.00
  status: OrderStatus.SERVED,
  settlementStatus: SettlementStatus.PARTIALLY_SETTLED,
});

// First payment
await factories.createSettlement(factory, {
  orderId: order.id,
  amountMinor: 6000, // $60.00
  recordedById: cashier.id,
  method: 'CASH',
});

// Second payment
await factories.createSettlement(factory, {
  orderId: order.id,
  amountMinor: 4000, // $40.00
  recordedById: cashier.id,
  method: 'CARD',
});
```

## Migration from Old Test Code

### Old Pattern

```typescript
await prisma.order.create({
  data: {
    clientOrderId: 'ord-1',
    tableNumber: 'T1',
    waiterId: waiter.id,
    items: [...],
    totalAmount: 3000,
    status: OrderStatus.PAID,
    isPaid: true,
    paymentMethod: PaymentMethod.CASH,
    paidAt: new Date(),
  },
});
```

### New Pattern

```typescript
const { order, settlement } = await factories.createSettledOrder(factory, {
  waiterId: waiter.id,
  items: [...],
  // totalAmount calculated automatically
  // status and settlementStatus set correctly
  // settlement record created
});
```

## Phase 8 Compliance

These factories ensure Phase 8 conventions:

✅ **Money in Minor Units**: All amounts use `amountMinor`, `price`, etc.  
✅ **Settlement-Based Payments**: Use Settlement records, not `isPaid`  
✅ **Proper Status Fields**: `settlementStatus` instead of deprecated fields  
✅ **Immutable Records**: Settlements are create-only, never updated  
✅ **Audit Trail**: `recordedById` and `recordedAt` on all financial records  
✅ **Idempotency**: Support for `idempotencyKey` on settlements  

## Testing the Factories

The factories themselves should be tested to ensure they work correctly:

```typescript
describe('Test Factories', () => {
  it('createUser generates unique emails', async () => {
    const user1 = await factories.createUser(factory);
    const user2 = await factories.createUser(factory);
    expect(user1.email).not.toBe(user2.email);
  });

  it('createSettledOrder creates matching settlement', async () => {
    const waiter = await factories.createUser(factory, { role: Role.WAITER });
    const cashier = await factories.createUser(factory, { role: Role.CASHIER });
    
    const { order, settlement } = await factories.createSettledOrder(factory, {
      waiterId: waiter.id,
      settlementRecordedById: cashier.id,
    });

    expect(settlement.amountMinor).toBe(order.totalAmount);
    expect(order.settlementStatus).toBe('FULLY_SETTLED');
  });
});
```

