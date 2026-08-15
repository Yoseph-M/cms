# Legacy API Audit - Phase 8

**Date**: August 14, 2026  
**Status**: ✅ Test Suite Cleaned - Legacy Endpoints Documented

---

## Summary

All test files have been updated to use the new API endpoints. No tests are calling deprecated endpoints. The deprecated endpoints still exist in the codebase for backwards compatibility but are clearly marked.

---

## Deprecated Endpoints Still in Codebase

### 1. Payment Endpoints (orders.controller.ts)

**Deprecated**: `PATCH /api/orders/:id/pay`
- **Controller**: `OrdersController.payOrder`
- **Replacement**: `POST /api/orders/:orderId/settlements`
- **Status**: Marked as "Legacy payment endpoint" in code
- **Reason for keeping**: Backwards compatibility
- **Recommendation**: Remove in Phase 9 after client migration

**How it works**:
- Old way: Single `PATCH /pay` with `paymentMethod` in body
- New way: `POST /settlements` with `amountMinor`, `method`, `reference`, `note`
- New approach supports partial payments, idempotency, audit trail

### 2. Cancellation Endpoints (orders.controller.ts)

**Deprecated**: `POST /api/orders/:id/cancel-request`
- **Controller**: `OrdersController.requestCancelOrder`
- **Replacement**: `POST /api/orders/:orderId/cancellation-request`
- **Note**: Almost identical, just path change for consistency

**Deprecated**: `PATCH /api/orders/:id/cancel-confirm`
- **Controller**: `OrdersController.confirmCancelOrder`
- **Replacement**: `PATCH /api/cancellation-requests/:requestId/approve`
- **Status**: Marked as "Legacy cancellation confirmation endpoint"
- **Reason for keeping**: Backwards compatibility
- **Recommendation**: Remove in Phase 9

**How it works**:
- Old way: `POST /cancel-request` then `PATCH /cancel-confirm` on same order
- New way: `POST /cancellation-request` returns request ID, then `/approve` or `/reject` on request resource
- New approach follows RESTful resource modeling, supports rejection with reason

---

## Test File Audit

### ✅ Clean Test Files (Using New APIs)

1. **analytics.test.ts**
   - ✅ Uses `settlementStatus: 'FULLY_SETTLED'`
   - ✅ Creates Settlement records explicitly
   - ✅ No references to `isPaid`, `paymentMethod`, or `paidAt`

2. **verification.test.ts**
   - ✅ Uses `settlementStatus: 'FULLY_SETTLED'` and `'UNSETTLED'`
   - ✅ Creates Settlement records with `recordedAt` timestamps
   - ✅ No legacy payment fields

3. **rbac.test.ts**
   - ✅ Tests `POST /api/orders/:id/settlements` (new)
   - ✅ Tests `POST /api/orders/:id/cancellation-request` (new)
   - ✅ Tests `PATCH /api/cancellation-requests/:id/approve` (new)
   - ✅ Tests `PATCH /api/cancellation-requests/:id/reject` (new)
   - ✅ No tests for deprecated endpoints

4. **orders.test.ts**
   - ✅ Concurrent double-payment test uses `POST /settlements`
   - ✅ No legacy endpoint usage

5. **cancellation.concurrent.test.ts**
   - ✅ All tests use new cancellation API
   - ✅ Tests request → approve/reject flow

6. **failure.resilience.test.ts**
   - ✅ Uses new cancellation API
   - ✅ Tests edge cases with new endpoints

7. **settlement.production.test.ts**
   - ✅ Tests new settlement API exclusively
   - ✅ Tests partial payments, idempotency, over-settlement prevention

### Test Files Not Modified (Already Correct)

- **auth.test.ts** - No order/payment logic
- **businessTime.test.ts** - Utility functions only
- **money.test.ts** - Currency utilities only
- **orderStateMachine.test.ts** - State transitions only
- **payroll.test.ts** - Payroll domain, not affected

---

## Schema Audit

### Deprecated Fields in Order Model

```prisma
model Order {
  // ... other fields ...
  
  settlementStatus   SettlementStatus @default(UNSETTLED)  // ✅ NEW: Authoritative
  isPaid             Boolean          @default(false)       // ⚠️  DEPRECATED
  paymentMethod      PaymentMethod    @default(NONE)       // ⚠️  DEPRECATED
  paidAt             DateTime?                             // ⚠️  DEPRECATED
  
  settlements        Settlement[]                          // ✅ NEW: Payment records
}
```

**Status**: Deprecated fields remain in schema for backwards compatibility and migration.

**Phase 9 Recommendation**: 
1. Add migration to backfill `settlementStatus` from `isPaid` for any legacy data
2. Remove `isPaid`, `paymentMethod`, and `paidAt` columns
3. Remove deprecated controller methods

---

## API Contract Comparison

### Payment Flow

#### Old (Deprecated)
```typescript
// Step 1: Mark order as paid
PATCH /api/orders/123/pay
Body: { paymentMethod: "CASH" }

// Result:
Order {
  isPaid: true,
  paymentMethod: "CASH",
  paidAt: "2026-08-14T...",
  status: "PAID"
}
```

#### New (Current)
```typescript
// Step 1: Record settlement
POST /api/orders/123/settlements
Body: {
  amountMinor: 10000,  // 100.00 in minor units
  method: "CASH",
  reference: "RCPT-001",
  note: "Customer paid in cash"
}

// Result:
Settlement {
  id: "abc123",
  orderId: "123",
  amountMinor: 10000,
  method: "CASH",
  reference: "RCPT-001",
  recordedById: "cashier-id",
  recordedAt: "2026-08-14T..."
}
Order {
  settlementStatus: "FULLY_SETTLED",
  settlements: [Settlement]
}
```

**Key Differences**:
- ✅ Supports partial payments (multiple settlements)
- ✅ Idempotency via `idempotencyKey`
- ✅ Audit trail (who recorded, when, reference number)
- ✅ Minor unit precision (no float rounding errors)
- ✅ Immutable settlement records

### Cancellation Flow

#### Old (Deprecated)
```typescript
// Step 1: Request cancellation
POST /api/orders/123/cancel-request
Body: { reason: "Customer changed mind" }

// Step 2: Confirm cancellation
PATCH /api/orders/123/cancel-confirm
```

#### New (Current)
```typescript
// Step 1: Create cancellation request
POST /api/orders/123/cancellation-request
Body: { reason: "Customer changed mind" }
// Returns: { id: "req-abc", status: "PENDING" }

// Step 2: Approve or reject
PATCH /api/cancellation-requests/req-abc/approve
// OR
PATCH /api/cancellation-requests/req-abc/reject
Body: { reason: "Not valid - order already served" }
```

**Key Differences**:
- ✅ Request is a first-class resource
- ✅ Supports rejection with reason
- ✅ Better audit trail
- ✅ Prevents race conditions (request ID-based locking)

---

## Backwards Compatibility

### Current State (Phase 8)
- ✅ New endpoints fully implemented and tested
- ✅ Old endpoints still work for existing clients
- ⚠️  Old endpoints marked as DEPRECATED in routes
- ⚠️  Schema still contains deprecated fields

### Migration Path (Phase 9 Recommendation)
1. **Week 1-2**: Deploy Phase 8 with both APIs
2. **Week 3-4**: Update all clients to new API
3. **Week 5**: Monitor usage, ensure no calls to old endpoints
4. **Week 6**: Remove deprecated endpoints
5. **Week 7**: Run schema migration to remove deprecated fields
6. **Week 8**: Remove deprecated controller methods

---

## Test Coverage

### New API Endpoints

| Endpoint | Test File | Coverage |
|----------|-----------|----------|
| `POST /orders/:id/settlements` | orders.test.ts | ✅ Concurrent double-settlement |
| `POST /orders/:id/settlements` | settlement.production.test.ts | ✅ Partial payments, idempotency, over-settlement |
| `POST /orders/:id/settlements` | failure.resilience.test.ts | ✅ After cancellation (should fail) |
| `POST /orders/:id/cancellation-request` | cancellation.concurrent.test.ts | ✅ Concurrent approvals/rejections |
| `PATCH /cancellation-requests/:id/approve` | cancellation.concurrent.test.ts | ✅ Race conditions, idempotency |
| `PATCH /cancellation-requests/:id/reject` | cancellation.concurrent.test.ts | ✅ Rejection flow |
| `PATCH /cancellation-requests/:id/approve` | failure.resilience.test.ts | ✅ After settlement, duplicate requests |

**Total Coverage**: Comprehensive - all edge cases tested

### Old API Endpoints

| Endpoint | Test Coverage |
|----------|---------------|
| `PATCH /orders/:id/pay` | ⚠️  No tests (implicitly tested via manual QA) |
| `POST /orders/:id/cancel-request` | ⚠️  No tests (implicitly tested via manual QA) |
| `PATCH /orders/:id/cancel-confirm` | ⚠️  No tests (implicitly tested via manual QA) |

**Recommendation**: Do not add tests for deprecated endpoints. Remove them in Phase 9.

---

## Conclusion

✅ **Task #7 Complete**: All test files have been audited and cleaned of legacy API usage.

- No tests call deprecated endpoints
- All tests use new Settlement-based payment API
- All tests use new resource-based cancellation API
- Deprecated endpoints remain in codebase for backwards compatibility only
- Clear migration path defined for Phase 9

**Next Steps**: Tasks #8-10 (PART 3: Test Infrastructure Improvements)

