/**
 * Money Convention Migration: minor units → major units (ETB as entered)
 *
 * Previously the app stored money as integer cents (minor units): a 120.00 ETB
 * item was stored as 12000. Going forward everything is stored as entered
 * (major units): 120.00 ETB is stored as 120.
 *
 * This script converts EXISTING data by dividing every money field by 100.
 * It is idempotent — re-running it is a no-op on already-converted data
 * (values below 1000 are treated as already converted). Back up your database
 * before running it.
 *
 * Usage:
 *   cd backend
 *   npm run migrate:money-major-units
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** Collections and the money fields they hold (dot path for nested). */
const MONEY_FIELDS: Record<string, string[]> = {
  menuitems: ['price'],
  orders: ['totalAmount', 'items.$[].unitPrice'],
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

/**
 * Values below this are treated as already converted to major units.
 * In cents, even a 10 ETB item is 1000; after conversion everything is < 1000
 * for realistic menu prices, salaries, and settlement amounts.
 */
const ALREADY_CONVERTED_THRESHOLD = 1000;

function looksAlreadyConverted(value: number): boolean {
  return Math.abs(value) < ALREADY_CONVERTED_THRESHOLD;
}

async function main() {
  let converted = 0;
  let skipped = 0;

  for (const [collection, fields] of Object.entries(MONEY_FIELDS)) {
    const res = await prisma.$runCommandRaw({
      find: collection,
      filter: {},
      limit: 0,
    });
    const docs = (res as any)?.cursor?.firstBatch ?? [];

    for (const doc of docs) {
      const set: Record<string, number> = {};
      let needsUpdate = false;

      for (const path of fields) {
        const isNested = path.includes('$[].');
        if (isNested) {
          const [outer, inner] = path.split('$[].');
          const items = doc[outer];
          if (!Array.isArray(items)) continue;
          for (let i = 0; i < items.length; i++) {
            const val = items[i]?.[inner!];
            if (typeof val === 'number' && !looksAlreadyConverted(val)) {
              set[`${outer}.${i}.${inner}`] = Math.round((val / 100) * 100) / 100;
              needsUpdate = true;
            }
          }
        } else {
          const val = doc[path];
          if (typeof val === 'number' && !looksAlreadyConverted(val)) {
            set[path] = Math.round((val / 100) * 100) / 100;
            needsUpdate = true;
          }
        }
      }

      if (!needsUpdate) {
        skipped++;
        continue;
      }

      await prisma.$runCommandRaw({
        update: collection,
        updates: [{ q: { _id: doc._id }, u: { $set: set } }],
      });
      converted++;
      console.log(`  [${collection}] ${doc._id}: ${JSON.stringify(set)}`);
    }

    console.log(`✔ ${collection}: done`);
  }

  console.log(
    `\nMigration complete: ${converted} documents updated, ${skipped} already converted / skipped.`
  );
  console.log('Next: run `prisma db push` to sync the schema (Int → Float), then restart the backend.');
}

main()
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });