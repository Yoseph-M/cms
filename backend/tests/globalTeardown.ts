export default async function globalTeardown() {
  const replSet = (globalThis as any).__MONGO_REPLSET;
  if (replSet) {
    await replSet.stop();
    console.log('\n[globalTeardown] MongoMemoryReplSet stopped.\n');
  }
}
