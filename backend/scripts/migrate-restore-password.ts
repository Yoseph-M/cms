import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting migration to restore default passwordHash for OWNER, MANAGER, and CASHIER...');

  // Target roles that require a password
  const targetRoles = ['OWNER', 'MANAGER', 'CASHIER'];
  
  // Find users in these roles
  const users = await prisma.user.findMany({
    where: {
      role: {
        in: targetRoles as any[],
      },
    },
  });

  console.log(`Found ${users.length} users in roles: ${targetRoles.join(', ')}`);

  const defaultPassword = 'password123';
  const saltRounds = 10;
  const defaultHash = await bcrypt.hash(defaultPassword, saltRounds);

  let updatedCount = 0;

  for (const user of users) {
    if (!user.passwordHash) {
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: defaultHash },
      });
      updatedCount++;
      console.log(`- Backfilled password for user ${user.name} (${user.role})`);
    }
  }

  console.log(`Migration complete. Updated ${updatedCount} users.`);
}

main()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
