import { PrismaClient } from '@prisma/client';
import { hashPin } from '../src/utils/security';

const prisma = new PrismaClient();

async function runMigration() {
  console.log('Starting migration to drop passwordHash and backfill PINs...');

  try {
    const { salt, hash } = hashPin('1234');

    // 1. Backfill missing pinSalt and pinCodeHash using raw MongoDB command
    // This avoids Prisma crashing when parsing legacy BSON documents missing required schema fields.
    console.log('Backfilling missing pinSalt and pinCodeHash fields with fallback PIN 1234...');
    const backfillResult = await prisma.$runCommandRaw({
      update: 'users',
      updates: [
        {
          q: { pinSalt: { $exists: false } },
          u: { $set: { pinSalt: salt, pinCodeHash: hash } },
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
