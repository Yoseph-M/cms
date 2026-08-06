import { MongoMemoryReplSet } from 'mongodb-memory-server';

/**
 * Global setup: start an in-memory MongoDB replica set once for the entire
 * test suite. The URI is stashed in a global so individual tests can read it
 * and pass it to Prisma via DATABASE_URL.
 *
 * We use a ReplicaSet (not standalone) because Prisma + MongoDB requires it.
 *
 * Note: unique indexes are enforced at the application layer in tests
 * (find-before-create). `prisma db push` against memory servers is unreliable
 * and can hang; skip it here.
 */
export default async function globalSetup() {
  const replSet = new MongoMemoryReplSet({
    instanceOpts: [{ launchTimeout: 60_000 }],
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  await replSet.start();
  await replSet.waitUntilRunning();

  const uri = replSet.getUri('cms_test');
  process.env.DATABASE_URL = uri;
  // Store on globalThis so globalTeardown can stop it
  (globalThis as any).__MONGO_REPLSET = replSet;

  console.log(`\n[globalSetup] MongoMemoryReplSet started at ${uri}\n`);
}
