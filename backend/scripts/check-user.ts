import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findUnique({ where: { email: 'owner@pos.com' } });
  console.log('User found:', user?.email);
  console.log('Has passwordHash:', !!user?.passwordHash);
  if (user?.passwordHash) {
    console.log('Password hash length:', user.passwordHash.length);
    console.log('Password hash start:', user.passwordHash.substring(0, 7));
  }
}

main().finally(() => prisma.$disconnect());
