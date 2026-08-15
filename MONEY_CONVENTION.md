# Money Convention - Phase 8

**Status**: 🔴 IN PROGRESS  
**Date**: Phase 8 - Task #11  
**Authority**: This is the single source of truth for all money handling in the CMS.

## The Single Rule

> **ALL money values in this system are represented in minor units (cents).**

This applies to:
- Database storage (Prisma schema)
- API request bodies
- API response bodies
- Internal calculations
- Test fixtures
- Frontend state

## Why Minor Units?

### Problems with Decimal/Float Money
```javascript
// ❌ WRONG - Floating point arithmetic is imprecise
0.1 + 0.2 === 0.30000000000004  // JavaScript reality
12.34 * 100 === 1233.9999999998  // Rounding errors

// These errors compound in financial calculations:
let total = 0.0;
for (let i = 0; i < 1000; i++) {
  total += 0.01;  // Adding 1 cent 1000 times
}
console.log(total);  // 9.999999999999831 (not 10.00!)
```

### Benefits of Integer Minor Units
```javascript
// ✅ CORRECT - Integer arithmetic is exact
1234 + 5678 === 6912  // Always precise
12345 * 2 === 24690   // No rounding errors

// Financial calculations are always correct:
let totalMinor = 0;
for (let i = 0; i < 1000; i++) {
  totalMinor += 1;  // Adding 1 cent 1000 times
}
console.log(totalMinor);  // 1000 (exactly $10.00)
```

### Real-World Example
```javascript
// ❌ WRONG - Float money
const item1 = 12.34;  // $12.34
const item2 = 56.78;  // $56.78
const total = item1 + item2;  // 69.11999999999999
const taxRate = 0.0825;
const tax = total * taxRate;  // 5.702399999999999
const finalTotal = total + tax;  // 74.822...
// Now what? Round? When? How many times?

// ✅ CORRECT - Integer minor units
const item1Minor = 1234;  // $12.34
const item2Minor = 5678;  // $56.78
const totalMinor = item1Minor + item2Minor;  // 6912 (exactly)
const taxRate = 825;  // 8.25% as basis points
const taxMinor = Math.floor(totalMinor * taxRate / 10000);  // 570
const finalTotalMinor = totalMinor + taxMinor;  // 7482 ($74.82)
// Perfect. No ambiguity.
```

## Database Schema

All money fields in Prisma are `Int` (never `Float` or `Decimal`):

```prisma
model MenuItem {
  price Int  // ✅ Cents (1500 = $15.00)
}

model Order {
  totalAmount Int  // ✅ Cents
}

type OrderItem {
  unitPrice Int  // ✅ Cents (snapshot)
}

model Settlement {
  amountMinor Int  // ✅ Cents (explicit naming)
}

model Expense {
  amount Int  // ✅ Cents
}

model User {
  salaryAmount Int  // ✅ Cents per month
}

model UserPayment {
  baseSalary Int    // ✅ Cents
  paidAmount Int    // ✅ Cents
}
```

## API Contract

### Request Bodies

All money fields in request bodies MUST be minor units:

```typescript
// POST /api/menu
{
  "name": "Burger",
  "category": "FOOD",
  "price": 1599  // ✅ $15.99 in cents
}

// POST /api/orders
{
  "tableNumber": "T1",
  "items": [{
    "menuItemId": "...",
    "name": "Burger",
    "unitPrice": 1599,  // ✅ Cents (snapshot from MenuItem.price)
    "quantity": 2
  }]
}

// POST /api/orders/:id/settlements
{
  "amountMinor": 3198,  // ✅ $31.98 in cents
  "method": "CASH"
}

// POST /api/expenses
{
  "category": "UTILITIES",
  "amount": 45050,  // ✅ $450.50 in cents
  "description": "Electric bill"
}
```

### Response Bodies

All money fields in response bodies MUST be minor units:

```typescript
// GET /api/menu/[id]
{
  "id": "...",
  "name": "Burger",
  "price": 1599,  // ✅ Cents
  "category": "FOOD"
}

// GET /api/orders/[id]
{
  "id": "...",
  "totalAmount": 3198,  // ✅ Cents
  "items": [{
    "name": "Burger",
    "unitPrice": 1599,  // ✅ Cents
    "quantity": 2
  }]
}

// GET /api/analytics/daily-sales
{
  "totalRevenue": 125000,  // ✅ $1,250.00 in cents
  "orderCount": 45
}
```

### ❌ NO Conversion at API Boundary

The API does NOT convert between dollars and cents. Clients MUST send cents. The API MUST return cents.

```typescript
// ❌ WRONG - API converts dollars to cents
app.post('/api/menu', (req, res) => {
  const priceInCents = req.body.price * 100;  // NO!
  await prisma.menuItem.create({
    data: { price: priceInCents }
  });
});

// ✅ CORRECT - API expects cents
app.post('/api/menu', (req, res) => {
  await prisma.menuItem.create({
    data: { price: req.body.price }  // Already in cents
  });
});
```

## Frontend

### State Management

All money in frontend state is minor units:

```typescript
// ✅ CORRECT - Store state
interface MenuItem {
  id: string;
  name: string;
  price: number;  // Always cents
}

interface Order {
  totalAmount: number;  // Always cents
  items: OrderItem[];
}

interface OrderItem {
  unitPrice: number;  // Always cents
  quantity: number;
}
```

### Display Formatting

Convert to dollars ONLY for display:

```typescript
// ✅ CORRECT - Format for display only
function formatCurrency(amountMinor: number): string {
  const dollars = amountMinor / 100;
  return `$${dollars.toFixed(2)}`;
}

// Usage
<div>Total: {formatCurrency(order.totalAmount)}</div>
// Displays: "Total: $31.98"
```

### Input Handling

Convert from dollars to cents when capturing user input:

```typescript
// ✅ CORRECT - Convert dollar input to cents
function handlePriceInput(dollarString: string): number {
  const dollars = parseFloat(dollarString);
  return Math.round(dollars * 100);  // Convert to cents
}

// Usage
const priceMinor = handlePriceInput("15.99");  // Returns 1599
await api.post('/api/menu', {
  name: "Burger",
  price: priceMinor  // Send cents to API
});
```

## Calculation Rules

### Addition/Subtraction

Direct integer math (no conversion needed):

```typescript
// ✅ CORRECT
const item1 = 1599;  // $15.99
const item2 = 899;   // $8.99
const total = item1 + item2;  // 2498 ($24.98)

const paid = 3000;  // $30.00
const change = paid - total;  // 502 ($5.02)
```

### Multiplication

Multiply then round (for tax, tips, discounts):

```typescript
// ✅ CORRECT - Tax calculation
const subtotal = 10000;  // $100.00
const taxRate = 825;  // 8.25% (stored as basis points)
const tax = Math.round(subtotal * taxRate / 10000);  // 825 ($8.25)

// ✅ CORRECT - Percentage discount
const originalPrice = 5999;  // $59.99
const discountPercent = 15;  // 15%
const discount = Math.round(originalPrice * discountPercent / 100);  // 900 ($9.00)
const finalPrice = originalPrice - discount;  // 5099 ($50.99)

// ✅ CORRECT - Tip calculation
const billAmount = 4567;  // $45.67
const tipPercent = 18;  // 18%
const tip = Math.round(billAmount * tipPercent / 100);  // 822 ($8.22)
```

### Division

Round appropriately (for splitting bills):

```typescript
// ✅ CORRECT - Split bill
const totalAmount = 10000;  // $100.00
const numberOfPeople = 3;
const perPerson = Math.round(totalAmount / numberOfPeople);  // 3333 ($33.33)
const remainder = totalAmount - (perPerson * numberOfPeople);  // 1 cent

// Handle remainder (one person pays the extra cent)
const payments = [
  perPerson + remainder,  // 3334 ($33.34)
  perPerson,              // 3333 ($33.33)
  perPerson,              // 3333 ($33.33)
];
// Total: 10000 (exactly)
```

### Aggregation

Sum minor units directly:

```typescript
// ✅ CORRECT - Calculate order total
const order = {
  items: [
    { unitPrice: 1599, quantity: 2 },  // $15.99 × 2
    { unitPrice: 899, quantity: 1 },   // $8.99 × 1
    { unitPrice: 1299, quantity: 3 },  // $12.99 × 3
  ]
};

const totalAmount = order.items.reduce((sum, item) => {
  return sum + (item.unitPrice * item.quantity);
}, 0);
// Result: 7095 ($70.95)
```

## Common Patterns

### Pattern 1: Create Menu Item

```typescript
// Backend controller
router.post('/menu', async (req, res) => {
  const { name, category, price } = req.body;  // price already in cents
  
  const menuItem = await prisma.menuItem.create({
    data: {
      name,
      category,
      price,  // Store cents directly
    },
  });
  
  res.json(menuItem);  // Return cents
});

// Frontend call
const createMenuItem = async (name: string, dollarAmount: string) => {
  const priceMinor = Math.round(parseFloat(dollarAmount) * 100);
  
  const response = await api.post('/api/menu', {
    name,
    category: 'FOOD',
    price: priceMinor,  // Send cents
  });
  
  return response.data;  // Receives cents
};

// Frontend display
<div>{formatCurrency(menuItem.price)}</div>
```

### Pattern 2: Create Order

```typescript
// Backend controller
router.post('/orders', async (req, res) => {
  const { items } = req.body;  // items already have unitPrice in cents
  
  // Calculate total (all in cents)
  const totalAmount = items.reduce((sum, item) => 
    sum + (item.unitPrice * item.quantity), 0
  );
  
  const order = await prisma.order.create({
    data: {
      items,
      totalAmount,  // Store cents
      ...otherFields,
    },
  });
  
  res.json(order);  // Return cents
});
```

### Pattern 3: Record Settlement

```typescript
// Backend controller
router.post('/orders/:id/settlements', async (req, res) => {
  const { amountMinor, method } = req.body;  // amountMinor in cents
  
  const settlement = await prisma.settlement.create({
    data: {
      orderId: req.params.id,
      amountMinor,  // Store cents directly
      method,
      recordedById: req.user.userId,
    },
  });
  
  res.json(settlement);  // Return cents
});
```

### Pattern 4: Analytics Query

```typescript
// Backend controller
router.get('/analytics/daily-sales', async (req, res) => {
  const orders = await prisma.order.findMany({
    where: { status: 'PAID' },
  });
  
  // Aggregate in cents
  const totalRevenue = orders.reduce((sum, order) => 
    sum + order.totalAmount, 0
  );
  
  res.json({
    totalRevenue,  // Return cents
    orderCount: orders.length,
  });
});

// Frontend display
<div>
  Total Revenue: {formatCurrency(analytics.totalRevenue)}
</div>
```

## Validation

### Backend Validation

Validate that money values are positive integers:

```typescript
import { z } from 'zod';

// ✅ CORRECT - Schema validation
const createMenuItemSchema = z.object({
  name: z.string().min(1),
  category: z.enum(['FOOD', 'BEVERAGE']),
  price: z.number().int().positive(),  // Must be positive integer
});

const createSettlementSchema = z.object({
  amountMinor: z.number().int().positive(),  // Must be positive integer
  method: z.enum(['CASH', 'CARD', 'MOBILE']),
});
```

### Frontend Validation

Validate dollar input before conversion:

```typescript
// ✅ CORRECT - Validate dollar input
function validatePriceInput(input: string): boolean {
  const dollarRegex = /^\d+(\.\d{1,2})?$/;
  if (!dollarRegex.test(input)) {
    return false;
  }
  
  const dollars = parseFloat(input);
  return dollars > 0 && dollars < 1000000;  // Reasonable range
}

// Usage
if (!validatePriceInput(priceInput)) {
  setError("Please enter a valid price (e.g., 15.99)");
  return;
}

const priceMinor = Math.round(parseFloat(priceInput) * 100);
```

## Anti-Patterns

### ❌ DON'T: Store Dollars

```typescript
// ❌ WRONG - Storing dollars
await prisma.menuItem.create({
  data: {
    price: 15.99,  // NO! Use 1599
  },
});
```

### ❌ DON'T: Convert at Multiple Layers

```typescript
// ❌ WRONG - Converting multiple times
// Frontend
const priceMinor = parseFloat(input) * 100;  // Convert to cents
api.post('/menu', { price: priceMinor });

// Backend
const priceDollars = req.body.price / 100;  // Convert back to dollars
const priceMinor = priceDollars * 100;  // Convert to cents again
// Result: 1598.9999999998 (rounding errors!)
```

### ❌ DON'T: Mix Units

```typescript
// ❌ WRONG - Mixing dollars and cents
const itemPriceDollars = 15.99;
const taxCents = 132;
const total = itemPriceDollars + taxCents;  // 148.31 (nonsense!)

// ✅ CORRECT - Same units
const itemPriceCents = 1599;
const taxCents = 132;
const totalCents = itemPriceCents + taxCents;  // 1731 ($17.31)
```

### ❌ DON'T: Use toFixed() for Calculations

```typescript
// ❌ WRONG - toFixed returns string, causes bugs
const subtotal = 10.00;
const tax = (subtotal * 0.0825).toFixed(2);  // "0.83" (string!)
const total = subtotal + tax;  // "10.000.83" (wrong!)

// ✅ CORRECT - Use integers
const subtotalMinor = 1000;
const taxMinor = Math.round(subtotalMinor * 825 / 10000);  // 83
const totalMinor = subtotalMinor + taxMinor;  // 1083
```

## Migration Path

### Existing Code Using Dollars

If you find code using float dollars:

1. **Identify the conversion point**
   - Where does the data enter the system?
   - Where is it displayed?

2. **Move conversion to boundaries**
   - Input: Convert dollars → cents at form submission
   - Output: Convert cents → dollars at display

3. **Update storage**
   - Database: Ensure all money columns are `Int`
   - State: Ensure all money properties are `number` (cents)

4. **Fix calculations**
   - Replace float arithmetic with integer arithmetic
   - Add proper rounding where needed

### Example Migration

```typescript
// ❌ BEFORE - Float money
const menuItem = {
  price: 15.99,  // Dollars
};

const order = {
  items: [
    { unitPrice: 15.99, quantity: 2 },
  ],
};

const total = order.items.reduce((sum, item) => 
  sum + (item.unitPrice * item.quantity), 0.0
);
// Result: 31.98 (but actually 31.979999999999997)

// ✅ AFTER - Integer cents
const menuItem = {
  price: 1599,  // Cents
};

const order = {
  items: [
    { unitPrice: 1599, quantity: 2 },
  ],
};

const total = order.items.reduce((sum, item) => 
  sum + (item.unitPrice * item.quantity), 0
);
// Result: 3198 (exactly)
```

## Testing

### Test Fixtures

Always use minor units in test data:

```typescript
// ✅ CORRECT - Test fixtures
const testMenuItem = await factories.createMenuItem({ prisma }, {
  name: 'Test Burger',
  price: 1599,  // $15.99 in cents
});

const testOrder = await factories.createOrder({ prisma }, {
  totalAmountMinor: 3198,  // $31.98 in cents
});

const testSettlement = await factories.createSettlement({ prisma }, {
  amountMinor: 3198,  // $31.98 in cents
});
```

### Assertions

Assert on minor units:

```typescript
// ✅ CORRECT - Test assertions
expect(menuItem.price).toBe(1599);
expect(order.totalAmount).toBe(3198);
expect(settlement.amountMinor).toBe(3198);

// ✅ CORRECT - Calculation tests
const item1 = 1599;
const item2 = 1599;
const total = item1 + item2;
expect(total).toBe(3198);
```

## Naming Conventions

### Explicit Names (Preferred for New Code)

Use explicit suffixes to indicate units:

```typescript
// ✅ PREFERRED - Explicit naming
interface Settlement {
  amountMinor: number;  // Clearly cents
}

interface Expense {
  amountMinor: number;  // Clearly cents
}

function calculateTotalMinor(items: OrderItem[]): number {
  // Function name indicates return value is in minor units
}
```

### Implicit Names (Acceptable for Established Fields)

If the entire system uses minor units, simple names are okay:

```typescript
// ✅ ACCEPTABLE - When system-wide convention is clear
interface MenuItem {
  price: number;  // Implicitly cents (system-wide rule)
}

interface Order {
  totalAmount: number;  // Implicitly cents (system-wide rule)
}
```

**Important**: This document establishes that ALL money is minor units, so both naming styles are correct. Choose consistency within each module.

## Summary

1. **ALL money is minor units (cents)** - No exceptions
2. **Convert ONLY at UI boundaries** - Input parsing and display formatting
3. **Use integer arithmetic** - Never float math for money
4. **Validate as integers** - Zod schemas enforce `z.number().int()`
5. **Test with minor units** - Fixtures use cents
6. **Document with examples** - Show cents in comments

## Compliance Checklist

- [ ] Database schema uses `Int` for all money fields
- [ ] API requests expect minor units
- [ ] API responses return minor units
- [ ] Frontend state stores minor units
- [ ] Display formatting converts cents → dollars at render time
- [ ] Input parsing converts dollars → cents immediately
- [ ] All calculations use integer arithmetic
- [ ] All tests use minor units
- [ ] No float money anywhere in the codebase

**Next Steps**: Tasks #12-15 will audit and fix all code to comply with this convention.

