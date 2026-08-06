/**
 * Removes duplicate refresh_tokens rows so the unique tokenHash index can be created.
 * Keeps the newest document per tokenHash.
 *
 * Run: npx tsx scripts/dedupe-refresh-tokens.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const tokens = await prisma.refreshToken.findMany({
    orderBy: { createdAt: 'desc' },
    select: { id: true, tokenHash: true, createdAt: true },
  });

  const seen = new Set<string>();
  const toDelete: string[] = [];

  for (const t of tokens) {
    if (seen.has(t.tokenHash)) {
      toDelete.push(t.id);
    } else {
      seen.add(t.tokenHash);
    }
  }

  if (toDelete.length === 0) {
    console.log('No duplicate refresh_tokens found.');
    return;
  }

  const result = await prisma.refreshToken.deleteMany({
    where: { id: { in: toDelete } },
  });

  console.log(`Removed ${result.count} duplicate refresh_token(s). Re-run: npx prisma db push`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
