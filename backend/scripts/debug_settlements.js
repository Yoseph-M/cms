const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const count = await prisma.settlement.count();
  console.log('Total settlements:', count);
  
  const samples = await prisma.settlement.findMany({
    take: 5,
    include: {
      order: {
        select: { id: true, clientOrderId: true }
      }
    }
  });
  console.log('Sample settlements:', JSON.stringify(samples, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
