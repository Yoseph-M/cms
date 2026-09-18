/**
 * Money Migration: drop cents, store whole ETB integers
 *
 * Every money field is rounded to the nearest whole unit and re-stored as a
 * 32-bit integer (matching the Prisma schema, which now declares these fields
 * as `Int`). Run this BEFORE `prisma db push` against a database that still
 * holds fractional (double) values, otherwise reads will reject the old
 * doubles.
 *
 * The script is idempotent — rounding an already-integer value is a no-op.
 * Back up your database before running it.
 *
 * Usage:
 *   cd backend
 *   npm run migrate:money-integers
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** Collections and the scalar money fields they hold. */
const MONEY_FIELDS: Record<string, string[]> = {
  menuitems: ['price'],
  settlements: ['amountMinor'],
  cash_drawer_events: ['amountMinor'],
  cashier_shifts: [
    'openingCashMinor',
    'expectedCashMinor',
    'declaredCashMinor',
    'varianceMinor',
    'expectedCardMinor',
    'declaredCardMinor',
    'expectedMobileMinor',
    'declaredMobileMinor',
  ],
  variance_reviews: ['varianceMinor', 'cardVarianceMinor', 'mobileVarianceMinor'],
  daily_closes: [
    'totalSalesMinor',
    'totalSettledMinor',
    'cashSettledMinor',
    'cardSettledMinor',
    'mobileSettledMinor',
    'otherSettledMinor',
    'cashExpectedMinor',
    'cashDeclaredMinor',
    'cashVarianceMinor',
  ],
  expenses: ['amount'],
  user_payments: ['baseSalary', 'paidAmount'],
  payroll_adjustments: ['adjustmentAmount'],
};

/** Round a number to the nearest whole unit and cast it to int32. */
const toInt = (expr: string) => ({
  $cond: [
    { $isNumber: expr },
    { $toInt: { $round: [expr, 0] } },
    expr,
  ],
});

async function main() {
  for (const [collection, fields] of Object.entries(MONEY_FIELDS)) {
    const set: Record<string, any> = {};
    for (const field of fields) {
      set[field] = toInt(`$${field}`);
    }

    const res: any = await prisma.$runCommandRaw({
      update: collection,
      updates: [{ q: {}, u: [{ $set: set }], multi: true }],
    });

    console.log(
      `✔ ${collection}: ${res?.nModified ?? 0} modified of ${res?.n ?? '?'} matched`,
    );
  }

  // Orders hold money inside the embedded `items` array.
  const orderRes: any = await prisma.$runCommandRaw({
    update: 'orders',
    updates: [
      {
        q: {},
        u: [
          {
            $set: {
              totalAmount: toInt('$totalAmount'),
              items: {
                $map: {
                  input: { $ifNull: ['$items', []] },
                  as: 'it',
                  in: {
                    $mergeObjects: [
                      '$$it',
                      { unitPrice: toInt('$$it.unitPrice') },
                    ],
                  },
                },
              },
            },
          },
        ],
        multi: true,
      },
    ],
  });
  console.log(
    `✔ orders: ${orderRes?.nModified ?? 0} modified of ${orderRes?.n ?? '?'} matched`,
  );

  console.log('\nMigration complete. Next: run `prisma db push`, then restart the backend.');
}

main()
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
