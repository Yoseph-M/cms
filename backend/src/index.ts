import http from 'http';
import { app, seedInitialData } from './app';
import { config } from './config';
import { connectDatabase } from './services/prisma.service';
import { initSocketService } from './services/socket.service';
import { startNotificationScheduler } from './services/notification.scheduler';
import { logger } from './utils/logger';

async function startServer() {
  const server = http.createServer(app);

  initSocketService(server);
  await connectDatabase();

  if (config.nodeEnv === 'production') {
    logger.info('Skipping demo data seeding in production.');
  } else {
    await seedInitialData();
  }

  if (config.nodeEnv !== 'test') {
    startNotificationScheduler();
  }

  server.listen(config.port, () => {
    logger.info(`Server running in ${config.nodeEnv} mode on http://localhost:${config.port}`);
  });
}

startServer().catch((error) => {
  logger.error({ error }, 'Fatal error during server startup.');
});
