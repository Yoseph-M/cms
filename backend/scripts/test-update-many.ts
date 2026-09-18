import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const order = await prisma.order.findFirst();
  if (!order) {
    console.log('No order found');
    return;
  }
  console.log('Testing updateMany on order', order.id);
  const updateResult = await prisma.order.updateMany({
    where: {
      id: order.id,
      settlementStatus: order.settlementStatus,
    },
    data: {
      clientOrderId: order.clientOrderId, // dummy update
    },
  });
  console.log('updateResult:', updateResult);
}
main().finally(() => prisma.$disconnect());
