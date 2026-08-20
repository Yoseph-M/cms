import http from 'http';
import { app, seedInitialData } from './app';
import { config } from './config';
import { connectDatabase, prisma } from './services/prisma.service';
import { initSocketService } from './services/socket.service';
import { startNotificationScheduler } from './services/notification.scheduler';
import { printJobRecoveryService } from './services/print-job-recovery.service';
import { logger } from './utils/logger';
import { requireTransactionSupport, detectTransactionSupport, getTransactionCapability } from './utils/transaction';
import { initBusinessTimezone } from './utils/businessTime';

/**
 * Validate required environment configuration for production
 */
function validateProductionConfig(): void {
  const requiredVars = ['DATABASE_URL', 'JWT_SECRET'];
  const missing = requiredVars.filter(v => !process.env[v]);
  
  if (missing.length > 0) {
    throw new Error(`FATAL: Missing required environment variables: ${missing.join(', ')}`);
  }
  
  // Validate JWT_SECRET is sufficiently long
  const jwtSecret = process.env.JWT_SECRET;
  if (jwtSecret && jwtSecret.length < 32) {
    throw new Error('FATAL: JWT_SECRET must be at least 32 characters for production security');
  }
  
  // Validate timezone if set
  if (process.env.BUSINESS_TIMEZONE) {
    try {
      Intl.DateTimeFormat('en-US', { timeZone: process.env.BUSINESS_TIMEZONE });
    } catch {
      throw new Error(`FATAL: Invalid BUSINESS_TIMEZONE: ${process.env.BUSINESS_TIMEZONE}`);
    }
  }
  
  logger.info('Production configuration validation passed');
}

async function startServer() {
  const server = http.createServer(app);

  // Validate production config before anything else
  if (config.nodeEnv === 'production') {
    validateProductionConfig();
  }

  // Initialize business timezone
  initBusinessTimezone();

  // Initialize database connection
  await connectDatabase();
  
  // Detect and validate transaction support
  const capability = await detectTransactionSupport(prisma);
  logger.info({ capability }, 'MongoDB transaction capability detected');
  
  // In production, fail if transactions are not supported
  if (config.nodeEnv === 'production') {
    await requireTransactionSupport(prisma);
  }

  // Initialize Socket.IO
  initSocketService(server);

  // Seed data in development/test only
  if (config.nodeEnv === 'production') {
    logger.info('Skipping demo data seeding in production.');
  } else {
    await seedInitialData();
  }

  // Start notification scheduler in non-test environments
  if (config.nodeEnv !== 'test') {
    startNotificationScheduler();
  }

  // Start print job recovery service in non-test environments
  if (config.nodeEnv !== 'test') {
    printJobRecoveryService.start();
    logger.info('Print job recovery service started');
  }

  server.listen(config.port, () => {
    logger.info(`Server running in ${config.nodeEnv} mode on http://localhost:${config.port}`);
    logger.info({ transactionCapability: getTransactionCapability() }, 'Transaction capability');
  });
}

startServer().catch((error) => {
  logger.error({ error }, 'Fatal error during server startup.');
  process.exit(1);
});
