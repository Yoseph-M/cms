# Timezone Contract - Phase 8

**Status**: ✅ ESTABLISHED  
**Authority**: Single source of truth for all timezone handling

## Core Principle

> **All timestamps are stored in UTC. All business logic operates in local time (East Africa Time, UTC+3).**

## Storage Rules

### Database
- All `DateTime` fields in Prisma are stored as UTC
- No timezone information is stored in the database
- Migration from local time to UTC is NOT required (Prisma handles this)

### API Requests
- Clients SHOULD send ISO 8601 timestamps with timezone offset
- Example: `2024-01-15T14:30:00.000+03:00`
- Server accepts and converts to UTC automatically

### API Responses
- Server returns ISO 8601 timestamps in UTC
- Example: `2024-01-15T11:30:00.000Z` (Z indicates UTC)
- Client converts to local timezone for display

## Business Logic Rules

### Business Day Calculations
Business days are defined in **local time** (East Africa Time, UTC+3):
- Business day starts: 00:00:00 local time
- Business day ends: 23:59:59 local time

**Implementation**: `backend/src/utils/businessTime.ts`

```typescript
// ✅ CORRECT - Returns local midnight as Date
export function getBusinessDayStart(date: Date = new Date()): Date {
  const y = date.getFullYear();
  const m = date.getMonth();
  const d = date.getDate();
  return new Date(y, m, d, 0, 0, 0, 0); // Local midnight
}

// ❌ WRONG - Using UTC
return new Date(Date.UTC(y, m, d, 0, 0, 0, 0)); // UTC midnight (wrong!)
```

### Month/Year Calculations
Month boundaries are in **local time**:
- Month starts: 1st day, 00:00:00 local time
- Month ends: Last day, 23:59:59 local time

```typescript
export function getMonthRange(year: number, month: number): { start: Date; end: Date } {
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  return { start, end };
}
```

### Date Comparisons
When comparing dates for business logic:
1. Convert both to local time
2. Compare day/month/year components
3. Do NOT use UTC comparison for business days

```typescript
// ✅ CORRECT - Compare local dates
function isSameBusinessDay(date1: Date, date2: Date): boolean {
  return date1.getFullYear() === date2.getFullYear() &&
         date1.getMonth() === date2.getMonth() &&
         date1.getDate() === date2.getDate();
}

// ❌ WRONG - Compare UTC
function isSameBusinessDay(date1: Date, date2: Date): boolean {
  return date1.getUTCFullYear() === date2.getUTCFullYear() &&
         date1.getUTCMonth() === date2.getUTCMonth() &&
         date1.getUTCDate() === date2.getUTCDate();
}
```

## Frontend Rules

### Display
- Always display dates/times in local timezone
- Use browser's `Intl.DateTimeFormat` or `toLocaleString()`
- Never display UTC directly to users

```typescript
// ✅ CORRECT - Local display
const localDate = new Date(utcTimestamp);
const display = localDate.toLocaleString('en-ET', {
  timeZone: 'Africa/Addis_Ababa',
  dateStyle: 'medium',
  timeStyle: 'short'
});

// ❌ WRONG - Showing UTC
const display = utcTimestamp + 'Z';
```

### Input
- Accept user input in local timezone
- Convert to ISO 8601 with timezone offset before sending to API
- Use `<input type="datetime-local">` for consistency

```typescript
// ✅ CORRECT - Send with timezone
const localDate = new Date(userInput);
const isoString = localDate.toISOString(); // Includes Z for UTC
await api.post('/endpoint', { timestamp: isoString });
```

## Analytics & Reporting

### Daily Reports
"Today's sales" means sales from 00:00 to 23:59 **local time**:

```typescript
const offsetHours = 3; // East Africa Time
const todayStart = new Date();
todayStart.setHours(0, 0, 0, 0); // Local midnight

const todayEnd = new Date();
todayEnd.setHours(23, 59, 59, 999); // Local end-of-day
```

### Monthly Reports
Month boundaries in **local time**:

```typescript
const monthStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);
```

### MongoDB Aggregations
When aggregating by date, use `$dateToString` with UTC but group by local day:

```typescript
const pipeline = [
  {
    $project: {
      localDate: {
        $dateToString: {
          format: '%Y-%m-%d',
          date: { $add: ['$createdAt', 3 * 3600000] } // Add 3 hours for EAT
        }
      }
    }
  },
  { $group: { _id: '$localDate', count: { $sum: 1 } } }
];
```

## Testing Rules

### Test Data
- Always set explicit timestamps in tests
- Use dates far in the future/past to avoid "now" ambiguity
- Include timezone offset in test dates

```typescript
// ✅ CORRECT - Explicit date
const order = await factories.createOrder({ prisma }, {
  createdAt: new Date('2026-06-15T12:00:00Z')
});

// ❌ WRONG - Implicit "now"
const order = await factories.createOrder({ prisma }, {
  // createdAt defaults to now - timezone-dependent!
});
```

### Test Assertions
- Use date component comparisons, not string equality
- Account for timezone differences in CI environments

```typescript
// ✅ CORRECT
expect(order.createdAt.getDate()).toBe(15);
expect(order.createdAt.getMonth()).toBe(5); // June = 5

// ❌ WRONG
expect(order.createdAt.toISOString()).toBe('2026-06-15T12:00:00.000Z');
// May fail if server timezone != UTC
```

## Migration Guide

### Existing Code Using UTC
If you find code that incorrectly uses UTC for business logic:

1. **Identify the bug**:
```typescript
// ❌ WRONG - Using UTC for business day
const start = new Date(Date.UTC(year, month, day, 0, 0, 0));
```

2. **Fix to use local time**:
```typescript
// ✅ CORRECT - Using local time
const start = new Date(year, month, day, 0, 0, 0);
```

3. **Test in different timezones**:
```bash
TZ=UTC npm test
TZ=America/New_York npm test
TZ=Africa/Addis_Ababa npm test
```

## Common Pitfalls

### ❌ Pitfall #1: Using UTC methods for business logic
```typescript
// ❌ WRONG
const businessDay = date.getUTCDate();

// ✅ CORRECT
const businessDay = date.getDate();
```

### ❌ Pitfall #2: Hardcoding timezone offset
```typescript
// ❌ WRONG - Hardcoded +3 hours
const localTime = new Date(utcTime.getTime() + 3 * 3600000);

// ✅ CORRECT - Use Date constructor
const localTime = new Date(utcTime);
// Then use getHours(), getDate(), etc. for local time
```

### ❌ Pitfall #3: Mixing UTC and local
```typescript
// ❌ WRONG - Mixing UTC year with local month
const date = new Date(Date.UTC(date.getFullYear(), date.getMonth(), 1));

// ✅ CORRECT - All local or all UTC
const date = new Date(date.getFullYear(), date.getMonth(), 1);
```

### ❌ Pitfall #4: Ignoring DST
East Africa Time (EAT) does NOT observe daylight saving time (UTC+3 year-round), but this may change. Always use proper timezone libraries if DST becomes relevant.

## Summary

| Aspect | Rule |
|--------|------|
| **Storage** | Always UTC |
| **Business Logic** | Always local time |
| **Display** | Always local time |
| **Input** | Accept local, send as ISO 8601 |
| **Comparisons** | Use local components (getDate, getMonth, getFullYear) |
| **MongoDB** | Store UTC, aggregate with offset |
| **Tests** | Explicit timestamps, component assertions |

**Golden Rule**: When in doubt, use JavaScript `Date` constructor methods (not UTC methods) for business logic.

