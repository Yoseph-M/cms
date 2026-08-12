import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/utils/security';

const prisma = new PrismaClient();

async function main() {
  const newHash = await hashPassword('password123');
  const user = await prisma.user.update({
    where: { email: 'cashier@pos.com' },
    data: { passwordHash: newHash },
  });
  console.log(`Password reset for ${user.email} to password123`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
