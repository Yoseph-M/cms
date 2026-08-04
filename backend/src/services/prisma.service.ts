import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
});

export async function connectDatabase() {
  try {
    await prisma.$connect();
    logger.info('Successfully connected to MongoDB database via Prisma ORM.');
  } catch (error) {
    logger.error({ error }, 'Failed to connect to MongoDB database via Prisma.');
  }
}

export async function disconnectDatabase() {
  await prisma.$disconnect();
}
