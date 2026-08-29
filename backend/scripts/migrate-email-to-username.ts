import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting migration: email -> username...');

  const users = await prisma.user.findRaw({
    filter: {}
  }) as unknown as any[];

  let updatedCount = 0;

  for (const user of users) {
    if (user.email) {
      const email = user.email;
      let username = email.split('@')[0];
      
      await prisma.user.updateRaw({
        filter: { _id: user._id },
        update: {
          $set: { username: username },
          $unset: { email: "" }
        }
      });
      console.log(`Migrated user ${user._id} (${email}) -> ${username}`);
      updatedCount++;
    }
  }

  console.log(`Migration complete. Migrated ${updatedCount} users.`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
