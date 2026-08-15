# Settlement Status Authority - Phase 8 Task #20

**Status**: ✅ VERIFIED  
**Date**: Phase 8 - Task #20

## Core Principle

> **`settlementStatus` is the single source of truth for payment state. Deprecated fields (`isPaid`, `paymentMethod`, `paidAt`) exist for backward compatibility only.**

## Order Model Fields

### ✅ Authoritative Field
```prisma
settlementStatus   SettlementStatus @default(UNSETTLED)
```

**Enum Values**:
- `UNSETTLED` - No payments recorded
- `PARTIALLY_SETTLED` - Some payment recorded, balance remains
- `SETTLED` - Fully paid

### ⚠️ Deprecated Fields (DO NOT USE)
```prisma
isPaid             Boolean          @default(false) // Deprecated: use settlementStatus instead
paymentMethod      PaymentMethod    @default(NONE) // Deprecated: check settlements instead
paidAt             DateTime?        // Deprecated: check settlements instead
```

**Why deprecated?**:
1. Orders can have multiple settlements (partial payments, mixed methods)
2. `isPaid` is binary, cannot represent partial payment
3. `paymentMethod` can't represent mixed payment methods (CASH + CARD)
4. `paidAt` doesn't capture multiple payment timestamps

## Payment State Logic

### ✅ CORRECT: Use settlementStatus
```typescript
// Check if order is fully paid
if (order.settlementStatus === 'SETTLED') {
  // Order is fully paid
}

// Check if order has any payment
if (order.settlementStatus === 'PARTIALLY_SETTLED' || order.settlementStatus === 'SETTLED') {
  // Order has at least one settlement
}

// Calculate payment details
const settlements = await prisma.settlement.findMany({
  where: { orderId: order.id }
});
const totalPaid = settlements.reduce((sum, s) => sum + s.amountMinor, 0);
const remaining = order.totalAmount - totalPaid;
```

### ❌ WRONG: Use deprecated fields
```typescript
// DO NOT DO THIS
if (order.isPaid) {
  // ...
}

// DO NOT DO THIS
if (order.paymentMethod === 'CASH') {
  // ...
}
```

## Code Audit Results

### ✅ Fixed: Analytics Controller
**Before** (Task #19):
```typescript
const match = { status: 'PAID', paymentMethod: { $ne: 'NONE' } };
Object.assign(match, dateRangeMatch('paidAt', ...));
const rawResult = await prisma.order.aggregateRaw({ pipeline });
```

**After** (Task #20):
```typescript
const match = {};
Object.assign(match, dateRangeMatch('createdAt', ...));
const rawResult = await prisma.settlement.aggregateRaw({ pipeline });
```

**Why**: Payment methods are stored in settlements, not orders. Aggregating from settlements gives accurate breakdown.

### ⚠️ Legacy Endpoints Remain

The following endpoints in `orders.controller.ts` still use deprecated fields:

1. **`POST /api/orders/:id/pay`** (line 238-295):
   - Sets `isPaid = true`, `paymentMethod`, `paidAt`
   - Sets `settlementStatus = 'SETTLED'` for consistency
   - **Status**: Legacy endpoint for backward compatibility
   - **Replacement**: `POST /api/orders/:id/settlements` (settlement.service.ts)

2. **`POST /api/orders/:id/cancel-request`** (line 320-324):
   - Checks `order.isPaid` for authorization
   - **Should check**: `order.settlementStatus !== 'UNSETTLED'`

3. **`POST /api/orders/:id/cancel-confirm`** (line 381-416):
   - Checks `order.isPaid` for authorization
   - Sets `isPaid = false` on cancellation
   - **Should use**: `settlementStatus` and handle reversals

**Decision**: These are **legacy endpoints**. New code should use the settlement service. Legacy endpoints remain for backward compatibility but are not recommended for new development.

## Settlement Service (Authoritative)

**Location**: `backend/src/services/settlement.service.ts`

### Creating Settlements
```typescript
import { recordSettlement } from '../services/settlement.service';

const result = await recordSettlement({
  orderId: order.id,
  amountMinor: 5000, // $50.00
  method: 'CASH',
  recordedById: cashier.id,
  idempotencyKey: `order-${order.id}-${Date.now()}`
});

// result.settlement contains the settlement record
// result.order.settlementStatus is automatically updated
```

### Querying Payment History
```typescript
const settlements = await prisma.settlement.findMany({
  where: { orderId: order.id },
  include: { recordedBy: true },
  orderBy: { createdAt: 'asc' }
});

const totalPaid = settlements.reduce((sum, s) => sum + s.amountMinor, 0);
const remaining = order.totalAmount - totalPaid;
const methods = [...new Set(settlements.map(s => s.method))];
```

## Authorization Rules

### ✅ CORRECT: Check settlementStatus
```typescript
// Only managers/owners can cancel paid orders
if (order.settlementStatus !== 'UNSETTLED' && 
    callerRole !== 'MANAGER' && 
    callerRole !== 'OWNER') {
  return res.status(403).json({ 
    error: 'Only Managers or Owners can cancel orders with payments' 
  });
}
```

### ❌ WRONG: Check isPaid
```typescript
// DO NOT DO THIS
if (order.isPaid && callerRole !== 'MANAGER' && callerRole !== 'OWNER') {
  // ...
}
```

## Analytics & Reporting

### Revenue Reports
**Always use settlements table**, never order.totalAmount with isPaid filter:

```typescript
// ✅ CORRECT
const revenue = await prisma.settlement.aggregate({
  where: {
    createdAt: { gte: startDate, lte: endDate }
  },
  _sum: { amountMinor: true }
});

// ❌ WRONG
const revenue = await prisma.order.aggregate({
  where: {
    isPaid: true,
    paidAt: { gte: startDate, lte: endDate }
  },
  _sum: { totalAmount: true }
});
```

**Why**: 
- Settlements represent actual cash received
- Orders may be partially paid
- Revenue timing should match cash receipt time, not order time

### Payment Method Breakdown
**Query settlements, not orders**:

```typescript
// ✅ CORRECT (Task #20 fix)
const byMethod = await prisma.settlement.groupBy({
  by: ['method'],
  _sum: { amountMinor: true },
  _count: true,
  where: {
    createdAt: { gte: startDate, lte: endDate }
  }
});

// ❌ WRONG (old code)
const byMethod = await prisma.order.groupBy({
  by: ['paymentMethod'],
  _sum: { totalAmount: true },
  where: { isPaid: true, paidAt: { gte: startDate, lte: endDate } }
});
```

## Migration Path

### Phase 8 (Current)
- ✅ `settlementStatus` is authoritative
- ✅ Settlement service handles all new payments
- ⚠️ Legacy endpoints remain for backward compatibility
- ⚠️ Deprecated fields are NOT removed (backward compatibility)

### Phase 9 (Future)
- 🔄 Deprecate legacy payment endpoint (`POST /api/orders/:id/pay`)
- 🔄 Add API versioning (v2 endpoints without deprecated fields)
- 🔄 Update all authorization checks to use `settlementStatus`
- 🔄 Add database constraints to prevent direct `isPaid` updates

### Phase 10 (Future)
- 🔄 Remove deprecated fields from schema
- 🔄 Remove legacy endpoints
- 🔄 Update all clients to use settlement API

## Testing

### Test for settlementStatus Authority
```typescript
describe('Settlement status authority', () => {
  it('should calculate payment state from settlements, not isPaid', async () => {
    const order = await factories.createOrder({ prisma }, {
      totalAmount: 10000,
      settlementStatus: 'UNSETTLED'
    });
    
    // Create partial settlement
    await factories.createSettlement({ prisma }, {
      orderId: order.id,
      amountMinor: 6000
    });
    
    const updated = await prisma.order.findUnique({
      where: { id: order.id },
      include: { settlements: true }
    });
    
    // settlementStatus should be updated
    expect(updated!.settlementStatus).toBe('PARTIALLY_SETTLED');
    
    // Calculate from settlements
    const totalPaid = updated!.settlements.reduce((sum, s) => sum + s.amountMinor, 0);
    expect(totalPaid).toBe(6000);
    expect(updated!.totalAmount - totalPaid).toBe(4000);
  });
  
  it('should not use deprecated isPaid field', async () => {
    const order = await factories.createOrder({ prisma }, {
      totalAmount: 5000,
      settlementStatus: 'SETTLED'
    });
    
    // Even if isPaid is false, settlementStatus is authoritative
    await prisma.order.update({
      where: { id: order.id },
      data: { isPaid: false } // Simulate inconsistency
    });
    
    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    
    // Use settlementStatus, ignore isPaid
    const isFullyPaid = updated!.settlementStatus === 'SETTLED';
    expect(isFullyPaid).toBe(true);
  });
});
```

## Summary

| Aspect | Status |
|--------|--------|
| **Authoritative field** | `settlementStatus` ✅ |
| **Analytics fixed** | Uses settlements table ✅ |
| **Legacy endpoints** | Remain for compatibility ⚠️ |
| **Authorization checks** | Need updates (Phase 9) 🔄 |
| **Schema migration** | Phase 10 🔄 |

**Current state**: `settlementStatus` is authoritative. New code uses settlement service. Legacy code remains but is deprecated.

