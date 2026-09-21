import { PrismaClient } from '@prisma/client';
import { hashPin } from '../src/utils/security';

const prisma = new PrismaClient();

/**
 * LEGACY — SUPERSEDED, DO NOT RUN.
 *
 * Kept only as a historical record of the original fallback-PIN migration.
 * The current PIN scheme is the same unsalted SHA-256 this script wrote, so
 * hashes it produced still verify. If you ever need to reset PINs in bulk,
 * write a NEW script that hashes with the current hashPin() and sets
 * pinCodeHash ONLY (there is no pinSalt field in the schema).
 */
async function runMigration() {
  console.log('Starting migration to drop passwordHash and backfill PINs...');

  try {
    const hash = hashPin('1234');

    // 1. Backfill missing pinCodeHash using raw MongoDB command
    // This avoids Prisma crashing when parsing legacy BSON documents missing required schema fields.
    console.log('Backfilling missing pinCodeHash fields with fallback PIN 1234...');
    const backfillResult = await prisma.$runCommandRaw({
      update: 'users',
      updates: [
        {
          q: { pinCodeHash: { $exists: false } },
          u: { $set: { pinCodeHash: hash } },
          multi: true,
        },
      ],
    });
    console.log('Backfill result:', backfillResult);

    // 2. Unset passwordHash at the MongoDB level using raw query
    console.log('Unsetting passwordHash field from all documents...');
    const result = await prisma.$runCommandRaw({
      update: 'users',
      updates: [
        {
          q: { passwordHash: { $exists: true } },
          u: { $unset: { passwordHash: '' } },
          multi: true,
        },
      ],
    });
    console.log('Unset passwordHash result:', result);

    // Now it is safe to read users using Prisma Client
    const users = await prisma.user.findMany({
      select: { id: true, name: true, role: true }
    });
    console.log(`Migration completed successfully. Active users in database: ${users.length}`);

  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

runMigration();
