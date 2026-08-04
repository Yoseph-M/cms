import { MongoMemoryReplSet } from 'mongodb-memory-server';

/**
 * Global setup: start an in-memory MongoDB replica set once for the entire
 * test suite. The URI is stashed in a global so individual tests can read it
 * and pass it to Prisma via DATABASE_URL.
 *
 * We use a ReplicaSet (not standalone) because Prisma + MongoDB requires it.
 */
export default async function globalSetup() {
  const replSet = new MongoMemoryReplSet({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  await replSet.start();

  const uri = replSet.getUri();
  process.env.DATABASE_URL = uri;
  // Store on globalThis so globalTeardown can stop it
  (globalThis as any).__MONGO_REPLSET = replSet;

  console.log(`\n[globalSetup] MongoMemoryReplSet started at ${uri}\n`);
}
