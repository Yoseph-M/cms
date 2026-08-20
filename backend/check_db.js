const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const allSettlements = await prisma.settlement.findMany();
  console.log('Total settlements:', allSettlements.length);
  
  const orphanedIds = [];
  for (const s of allSettlements) {
    const order = await prisma.order.findUnique({ where: { id: s.orderId } });
    if (!order) {
      orphanedIds.push(s.id);
    }
  }
  
  console.log('Orphaned settlements found:', orphanedIds.length);
  
  if (orphanedIds.length > 0) {
    const deleteResult = await prisma.settlement.deleteMany({
      where: { id: { in: orphanedIds } }
    });
    console.log('Deleted orphaned settlements:', deleteResult.count);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
