import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import { detectTransactionSupport } from '../utils/transaction';

// Configure Prisma with better connection handling and timeouts
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
});

// Handle Prisma connection errors gracefully
prisma.$on('error' as never, (e: any) => {
  logger.error({ error: e }, 'Prisma connection error occurred');
});

// Note: Immutability is enforced through:
// 1. No UPDATE/DELETE routes for CashDrawerEvent and Settlement
// 2. Service-layer validation (see immutability.middleware.ts)
// 3. Compensating events for corrections (CASH_ADJUSTMENT)

export async function connectDatabase() {
  try {
    await prisma.$connect();
    logger.info('Successfully connected to MongoDB database via Prisma ORM.');
    logger.info('Immutability enforced for CashDrawerEvent and Settlement models (no UPDATE/DELETE routes).');
    
    // Detect transaction support (replica set vs standalone)
    await detectTransactionSupport(prisma);
  } catch (error) {
    logger.error({ error }, 'Failed to connect to MongoDB database via Prisma.');
    // Do not start an HTTP server that cannot serve requests.  Continuing here
    // made a bad DATABASE_URL look like a healthy backend until the first API
    // request failed.
    throw error;
  }
}

export async function disconnectDatabase() {
  await prisma.$disconnect();
}
