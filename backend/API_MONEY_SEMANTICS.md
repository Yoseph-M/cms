# API Money Semantics - Phase 8

**Status**: 🔴 AUDITING  
**Date**: Phase 8 - Task #12  
**Authority**: Defines explicit contract for money handling in all API endpoints

## Core Principle

Per [MONEY_CONVENTION.md](/MONEY_CONVENTION.md):
> **ALL money values in requests and responses are in minor units (cents).**

The API MUST NOT convert between dollars and cents. Clients send cents, API stores cents, API returns cents.

## Current State Analysis

### ❌ BROKEN: Menu Endpoints

**File**: `/backend/src/modules/menu/menu.controller.ts`

#### Issue: Double Conversion

```typescript
// ❌ CURRENT CODE (WRONG)
export async function createMenuItem(req: AuthenticatedRequest, res: Response) {
  const { price } = req.body;
  const newItem = await prisma.menuItem.create({
    data: {
      price: Math.round(parseFloat(price) * 100),  // ❌ CONVERTING!
    },
  });
  return res.status(201).json(newItem);
}
```

**Problem**:
1. Frontend sends `price: 1599` (15.99 in cents)
2. Controller does `1599 * 100 = 159900` (wrong!)
3. Database stores `159900` ($1599.00 instead of $15.99)

**Evidence from Tests**:
- `analytics.test.ts` expects `20000` but receives `0` (calculation overflow/mismatch)
- `verification.test.ts` expects `1100000` but receives `110000000` (100x too large)

#### Schema Validation

```typescript
// ❌ CURRENT SCHEMA (AMBIGUOUS)
export const createMenuItemSchema = z.object({
  price: z.number().nonnegative('Price must be greater than or equal to 0'),
});
```

**Problem**: Schema accepts any `number`, doesn't specify that it must be:
1. An integer (no decimals)
2. In minor units (cents)

#### Fix Required

```typescript
// ✅ CORRECT SCHEMA
export const createMenuItemSchema = z.object({
  price: z.number().int('Price must be an integer (cents)').positive('Price must be greater than 0'),
});

// ✅ CORRECT CONTROLLER
export async function createMenuItem(req: AuthenticatedRequest, res: Response) {
  const { price } = req.body;  // Already in cents from client
  const newItem = await prisma.menuItem.create({
    data: {
      price,  // Store cents directly, no conversion
    },
  });
  return res.status(201).json(newItem);  // Return cents
}
```

### 🔍 TO AUDIT: Orders Endpoints

**File**: `/backend/src/modules/orders/orders.controller.ts`

#### Endpoints to Check:
- `POST /api/orders` - Check `items[].unitPrice` handling
- `GET /api/orders/:id` - Check `totalAmount` in response
- `PATCH /api/orders/:id/status` - No money involved (safe)

#### Expected Behavior:
1. Client sends `items[].unitPrice` in cents (snapshot from MenuItem.price)
2. Controller calculates `totalAmount` by summing `unitPrice * quantity` (all in cents)
3. Controller stores `totalAmount` in cents
4. Controller returns order with `totalAmount` in cents

#### Potential Issues:
- If controller converts `unitPrice` from dollars to cents (double conversion)
- If response converts `totalAmount` from cents to dollars

### 🔍 TO AUDIT: Settlement Endpoints

**File**: `/backend/src/modules/settlements/settlements.controller.ts` (if exists)  
**OR**: `/backend/src/modules/orders/orders.controller.ts` (settlement routes)

#### Endpoints to Check:
- `POST /api/orders/:id/settlements` - Check `amountMinor` handling
- `GET /api/settlements` - Check `amountMinor` in responses

#### Expected Behavior:
1. Client sends `amountMinor` in cents
2. Controller stores `amountMinor` in cents (no conversion)
3. Controller returns `amountMinor` in cents

#### Schema Status:
```typescript
// ✅ CURRENT SCHEMA (CORRECT!)
export const createSettlementSchema = z.object({
  amountMinor: z.number().int().positive('Amount must be greater than zero'),
});
```

**Note**: Settlement schema is already correct (enforces integer, uses explicit `Minor` suffix).

### 🔍 TO AUDIT: Expense Endpoints

**File**: `/backend/src/modules/expenses/expenses.controller.ts`

#### Endpoints to Check:
- `POST /api/expenses` - Check `amount` handling
- `GET /api/expenses` - Check `amount` in responses

#### Expected Behavior:
1. Client sends `amount` in cents
2. Controller stores `amount` in cents
3. Controller returns `amount` in cents

#### Schema to Check:
Need to verify expense schema enforces integer cents.

### 🔍 TO AUDIT: Payroll Endpoints

**File**: `/backend/src/modules/payroll/payroll.controller.ts`

#### Endpoints to Check:
- `POST /api/payroll` - Check `baseSalary`, `paidAmount` handling
- `GET /api/payroll` - Check money fields in responses
- `PATCH /api/payroll/:id` - Check adjustment handling

#### Expected Behavior:
1. All money fields (`baseSalary`, `paidAmount`, `adjustmentAmount`) in cents
2. No conversion in controller
3. All responses return cents

### 🔍 TO AUDIT: Analytics Endpoints

**File**: `/backend/src/modules/analytics/analytics.controller.ts`

#### Endpoints to Check:
- `GET /api/analytics/daily-sales` - Check `totalRevenue` aggregation
- `GET /api/analytics/profit-loss` - Check revenue, expenses, payroll calculations
- All other analytics endpoints that return money

#### Expected Behavior:
1. Aggregate from database values (already in cents)
2. Return aggregated values in cents (no conversion)

#### Known Issue from Tests:
- `profit-loss` endpoint returns incorrect revenue (0 instead of 20000)
- Likely caused by upstream menu item double conversion

## API Endpoint Inventory

### Menu Items API

| Endpoint | Method | Money Field | Current | Expected | Status |
|----------|--------|-------------|---------|----------|--------|
| `/api/menu` | GET | `price` | Returns cents ✅ | Returns cents | ❌ Broken (stores wrong value) |
| `/api/menu` | POST | `price` | Converts dollars→cents ❌ | Expects cents | ❌ Needs Fix |
| `/api/menu/:id` | PATCH | `price` | Converts dollars→cents ❌ | Expects cents | ❌ Needs Fix |

**Fix**: Remove `* 100` conversions in `createMenuItem` and `updateMenuItem`.

### Orders API

| Endpoint | Method | Money Field | Current | Expected | Status |
|----------|--------|-------------|---------|----------|--------|
| `/api/orders` | POST | `items[].unitPrice` | TBD | Expects cents | 🔍 To Audit |
| `/api/orders` | GET | `totalAmount` | TBD | Returns cents | 🔍 To Audit |
| `/api/orders/:id` | GET | `totalAmount` | TBD | Returns cents | 🔍 To Audit |

### Settlements API

| Endpoint | Method | Money Field | Current | Expected | Status |
|----------|--------|-------------|---------|----------|--------|
| `/api/orders/:id/settlements` | POST | `amountMinor` | Expects int cents ✅ | Expects cents | ✅ Likely Correct |
| `/api/settlements` | GET | `amountMinor` | TBD | Returns cents | 🔍 To Audit |

**Note**: Settlement schema is correct. Need to verify controller doesn't convert.

### Expenses API

| Endpoint | Method | Money Field | Current | Expected | Status |
|----------|--------|-------------|---------|----------|--------|
| `/api/expenses` | POST | `amount` | TBD | Expects cents | 🔍 To Audit |
| `/api/expenses` | GET | `amount` | TBD | Returns cents | 🔍 To Audit |

### Payroll API

| Endpoint | Method | Money Field | Current | Expected | Status |
|----------|--------|-------------|---------|----------|--------|
| `/api/payroll` | POST | `baseSalary`, `paidAmount` | TBD | Expects cents | 🔍 To Audit |
| `/api/payroll` | GET | All money fields | TBD | Returns cents | 🔍 To Audit |
| `/api/payroll/:id` | PATCH | `adjustmentAmount` | TBD | Expects cents | 🔍 To Audit |

### Analytics API

| Endpoint | Method | Money Field | Current | Expected | Status |
|----------|--------|-------------|---------|----------|--------|
| `/api/analytics/daily-sales` | GET | `totalRevenue` | TBD | Returns cents | 🔍 To Audit |
| `/api/analytics/profit-loss` | GET | `revenue`, `payrollCost`, `otherExpenses`, `netProfit` | TBD | Returns cents | ❌ Known Broken |
| `/api/analytics/category-split` | GET | Aggregated amounts | TBD | Returns cents | 🔍 To Audit |

## Validation Schema Requirements

All money fields MUST use this pattern:

```typescript
// ✅ CORRECT - Integer cents with explicit validation
price: z.number().int('Price must be an integer (cents)').positive('Price must be greater than 0')

amountMinor: z.number().int('Amount must be an integer (cents)').positive('Amount must be greater than 0')

totalAmount: z.number().int('Total must be an integer (cents)').nonnegative('Total cannot be negative')

// ✅ OPTIONAL money fields
price: z.number().int().positive().optional()

// ❌ WRONG - Allows decimals
price: z.number().nonnegative()

// ❌ WRONG - No integer constraint
amount: z.number().positive()
```

### Schema Audit Checklist

- [ ] `createMenuItemSchema` - Change `price` to enforce integer
- [ ] `updateMenuItemSchema` - Change `price` to enforce integer
- [ ] `createOrderSchema` → `orderItemInputSchema` - Change `unitPrice` to enforce integer
- [ ] `createSettlementSchema` - Already correct ✅
- [ ] `createExpenseSchema` - Check if exists, enforce integer
- [ ] `createPayrollSchema` - Check if exists, enforce integer
- [ ] `createUserSchema` - Change `salaryAmount` to enforce integer

## Controller Fix Pattern

### ❌ WRONG: Controller Converts

```typescript
// ❌ DON'T DO THIS
export async function create(req: Request, res: Response) {
  const { price } = req.body;
  const item = await prisma.create({
    data: {
      price: Math.round(parseFloat(price) * 100),  // ❌ NO!
    },
  });
  return res.json(item);
}
```

### ✅ CORRECT: Controller Passes Through

```typescript
// ✅ DO THIS
export async function create(req: Request, res: Response) {
  const { price } = req.body;  // Already validated as int cents
  const item = await prisma.create({
    data: {
      price,  // Store directly, no conversion
    },
  });
  return res.json(item);  // Return directly, no conversion
}
```

### Calculation Pattern

```typescript
// ✅ CORRECT: Calculate in cents
export async function createOrder(req: Request, res: Response) {
  const { items } = req.body;  // items[].unitPrice already in cents
  
  // Calculate total in cents
  const totalAmount = items.reduce((sum, item) => 
    sum + (item.unitPrice * item.quantity), 0
  );
  
  const order = await prisma.order.create({
    data: {
      items,
      totalAmount,  // Store cents
    },
  });
  
  return res.json(order);  // Return cents
}
```

## Testing Strategy

### Unit Test Pattern

```typescript
describe('POST /api/menu', () => {
  it('stores price in cents without conversion', async () => {
    const res = await request(app)
      .post('/api/menu')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Burger',
        category: 'FOOD',
        price: 1599,  // $15.99 in cents
      });
    
    expect(res.status).toBe(201);
    expect(res.body.price).toBe(1599);  // Should be exactly what we sent
    
    // Verify in database
    const item = await prisma.menuItem.findUnique({ where: { id: res.body.id } });
    expect(item?.price).toBe(1599);  // Should match
  });
});
```

### Integration Test Pattern

```typescript
describe('Order total calculation', () => {
  it('calculates total from cents without conversion', async () => {
    // Create menu item with price in cents
    const burger = await prisma.menuItem.create({
      data: { name: 'Burger', category: 'FOOD', price: 1599 },
    });
    
    // Create order with unitPrice in cents
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tableNumber: 'T1',
        items: [{
          menuItemId: burger.id,
          name: burger.name,
          unitPrice: 1599,  // Cents
          quantity: 2,
        }],
      });
    
    expect(res.status).toBe(201);
    expect(res.body.totalAmount).toBe(3198);  // 1599 * 2, no conversion
  });
});
```

## Migration Checklist

For each endpoint with money fields:

1. ✅ **Identify** - Find all money fields in request/response
2. ✅ **Schema** - Update validation to enforce `int().positive()`
3. ✅ **Controller** - Remove any `* 100` or `/ 100` conversions
4. ✅ **Test** - Verify with test cases (send cents, receive cents)
5. ✅ **Document** - Add JSDoc comment indicating cents

### Example

```typescript
/**
 * Create a new menu item.
 * 
 * @param price - Price in minor units (cents). E.g., 1599 for $15.99
 */
export async function createMenuItem(req: AuthenticatedRequest, res: Response) {
  const { name, category, price } = req.body;  // price is already in cents
  
  const newItem = await prisma.menuItem.create({
    data: { name, category, price },  // Store cents directly
  });
  
  return res.status(201).json(newItem);  // Return cents
}
```

## Next Steps

1. **Task #12 (This)**: Document all API money semantics ✅
2. **Task #13**: Fix frontend currency formatting (ensure sends cents)
3. **Task #14**: Remove double conversion patterns (fix menu controller)
4. **Task #15**: Normalize money in all financial modules (expenses, payroll, analytics)

## Summary

**Current Problems**:
- Menu endpoints multiply by 100 (double conversion)
- Schemas don't enforce integer cents
- No documentation of money units

**Required Fixes**:
- Remove all `* 100` conversions from controllers
- Update schemas to `z.number().int().positive()`
- Add JSDoc comments documenting cents
- Verify all endpoints follow convention

**Success Criteria**:
- All API tests pass
- No conversion in controllers
- All money values are integers
- Request cents = Response cents = Database cents

