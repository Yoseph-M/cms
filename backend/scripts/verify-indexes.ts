/**
 * Verify MongoDB indexes are used by representative queries.
 * Run: npx tsx scripts/verify-indexes.ts
 *
 * Requires DATABASE_URL pointing at a live MongoDB instance with collections seeded.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type ExplainResult = {
  executionStats?: {
    totalDocsExamined: number;
    nReturned: number;
    executionTimeMillis: number;
  };
  queryPlanner?: { winningPlan?: { inputStage?: { indexName?: string } } };
};

async function explain(collection: string, pipeline: Record<string, unknown>[]) {
  const raw = await prisma.$runCommandRaw({
    explain: { aggregate: collection, pipeline, cursor: {} },
    verbosity: 'executionStats',
  });
  return raw as ExplainResult;
}

function report(label: string, stats: ExplainResult['executionStats'], indexName?: string) {
  const examined = stats?.totalDocsExamined ?? -1;
  const returned = stats?.nReturned ?? -1;
  const ratio = returned > 0 ? (examined / returned).toFixed(1) : 'n/a';
  const ok = returned === 0 || examined <= returned * 3;
  console.log(
    `${ok ? '✓' : '✗'} ${label}`,
    `| examined=${examined} returned=${returned} ratio=${ratio}x`,
    indexName ? `| index=${indexName}` : ''
  );
}

async function main() {
  console.log('Index verification (aggregate explain)\n');

  // MenuItem: category + isAvailable
  const menuExplain = await explain('menu_items', [
    { $match: { category: 'FOOD', isAvailable: true } },
    { $limit: 50 },
  ]);
  report('MenuItem [category, isAvailable]', menuExplain.executionStats);

  // User: role + isActive
  const userExplain = await explain('users', [
    { $match: { role: 'WAITER', isActive: true } },
    { $limit: 50 },
  ]);
  report('User [role, isActive]', userExplain.executionStats);

  // Order: waiterId + createdAt
  const waiterExplain = await explain('orders', [
    { $match: { waiterId: { $exists: true } } },
    { $sort: { createdAt: -1 } },
    { $limit: 50 },
  ]);
  report('Order [waiterId, createdAt]', waiterExplain.executionStats);

  // Attendance: date range
  const attExplain = await explain('attendance', [
    { $match: { date: { $gte: '2026-01-01', $lte: '2026-01-31' } } },
    { $limit: 100 },
  ]);
  report('Attendance [date]', attExplain.executionStats);

  // UserPayment: periodYear + periodMonth
  const payExplain = await explain('user_payments', [
    { $match: { periodYear: 2026, periodMonth: 1 } },
    { $limit: 50 },
  ]);
  report('UserPayment [periodYear, periodMonth]', payExplain.executionStats);

  // AuditLog: actorId + timestamp
  const auditExplain = await explain('audit_logs', [
    { $match: { actorId: { $exists: true } } },
    { $sort: { timestamp: -1 } },
    { $limit: 50 },
  ]);
  report('AuditLog [actorId, timestamp]', auditExplain.executionStats);

  console.log('\nDone. Re-run after seeding data if collections are empty.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
