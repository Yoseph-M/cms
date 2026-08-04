import http from 'http';
import { app, seedInitialData } from './app';
import { config } from './config';
import { connectDatabase } from './services/prisma.service';
import { initSocketService } from './services/socket.service';
import { logger } from './utils/logger';

async function startServer() {
  const server = http.createServer(app);

  // Initialize Socket.io on /live namespace
  initSocketService(server);

  // Connect to Database
  await connectDatabase();

  // Seed default demo user accounts and menu items
  await seedInitialData();

  server.listen(config.port, () => {
    logger.info(`Server running in ${config.nodeEnv} mode on http://localhost:${config.port}`);
  });
}

startServer().catch((error) => {
  logger.error({ error }, 'Fatal error during server startup.');
});
