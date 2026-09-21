import { config } from './config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import authRoutes from './modules/auth/auth.routes';
import usersRoutes from './modules/users/users.routes';
import menuRoutes from './modules/menu/menu.routes';
import ordersRoutes from './modules/orders/orders.routes';
import attendanceRoutes from './modules/attendance/attendance.routes';
import payrollRoutes from './modules/payroll/payroll.routes';
import analyticsRoutes from './modules/analytics/analytics.routes';
import printersRoutes from './modules/printers/printers.routes';
import auditRoutes from './modules/audit/audit.routes';
import expensesRoutes from './modules/expenses/expenses.routes';
import notificationsRoutes from './modules/notifications/notifications.routes';
import settingsRoutes from './modules/settings/settings.routes';
import searchRoutes from './modules/search/search.routes';
import settlementsRoutes from './modules/settlements/settlements.routes';
import loginHistoryRoutes from './modules/login-history/loginHistory.routes';
import cancellationRoutes from './modules/cancellation/cancellation.routes';
import backupRoutes from './modules/backup/backup.routes';

// Phase 9 Domains
import dailyCloseRoutes from './modules/daily-close/dailyClose.routes';
import integrityRoutes from './modules/integrity/integrity.routes';
import printAgentsRoutes from './modules/print-agents/print-agents.routes';
import printJobsRoutes from './modules/print-jobs/print-jobs.routes';

import { errorHandler } from './middleware/error.middleware';
import { prisma } from './services/prisma.service';
import { hashPassword } from './utils/security';
import { Role, MenuCategory } from '@prisma/client';
import { logger, requestContext } from './utils/logger';
import crypto from 'crypto';
import * as Sentry from '@sentry/node';
import client from 'prom-client';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import path from 'path';

export const app = express();

// Sentry Init
Sentry.init({
  dsn: process.env.SENTRY_DSN || '',
  environment: process.env.NODE_ENV || 'development',
});

// Metrics Init
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics({ register: client.register });

const normalizeOrigin = (o: string | undefined) => o ? o.replace(/\/$/, '') : '';

const allowedOrigins = (
  config.nodeEnv === 'production'
    ? [config.webAppUrl, ...config.extraCorsOrigins]
    : [
        'http://localhost:3000',
        'http://localhost:5173',
        config.webAppUrl,
        ...config.extraCorsOrigins,
      ]
).filter(Boolean).map(normalizeOrigin).filter((v, i, a) => a.indexOf(v) === i);

app.use(helmet());
app.use(compression());
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow non-browser clients (curl, server-to-server) with no Origin header
      if (!origin || allowedOrigins.includes(normalizeOrigin(origin))) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));

// Request ID & Context Threading
app.use((req: Request, res: Response, next: NextFunction) => {
  const requestId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
  res.setHeader('X-Request-ID', requestId);
  // The error handler reads req.requestId to include it in error responses.
  (req as any).requestId = requestId;
  requestContext.run({ requestId }, () => {
    next();
  });
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per `window` (here, per 15 minutes)
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});

import { requireManagerDashboard } from './middleware/feature.middleware';

// API Route mounts
app.use('/api', apiLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/users', requireManagerDashboard, usersRoutes);
app.use('/api/menu', menuRoutes); // Cashier menu access is handled in its own route
app.use('/api/orders', ordersRoutes);
app.use('/api/attendance', requireManagerDashboard, attendanceRoutes);
app.use('/api/payroll', requireManagerDashboard, payrollRoutes);
app.use('/api/analytics', requireManagerDashboard, analyticsRoutes);
app.use('/api/settings/printers', printersRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/expenses', requireManagerDashboard, expensesRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/search', searchRoutes);
app.use('/api', cancellationRoutes); // /orders/:orderId/cancellation-request + /cancellation-requests review flow
app.use('/api', settlementsRoutes); // Settlements routes include /orders/:orderId/settlements
app.use('/api', loginHistoryRoutes); // Login history - OWNER only for security monitoring

// Phase 9 API Routes
// Shift management has been removed: cash settlement and the end-of-day close
// work directly off orders and settlements, with no open shift required.
app.use('/api/daily-close', requireManagerDashboard, dailyCloseRoutes);
app.use('/api/integrity', requireManagerDashboard, integrityRoutes);
app.use('/api/print-agents', printAgentsRoutes);
app.use('/api/print-jobs', printJobsRoutes);
// System Admin → Backup & restore (OWNER only, enforced in the router).
app.use('/api/backup', backupRoutes);

// Liveness probe — always responds 200 if the process is up
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'MERN POS API' });
});

app.get('/api/health/live', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Readiness probe — verifies DB connectivity before accepting traffic
app.get('/api/health/ready', async (req: Request, res: Response) => {
  try {
    await prisma.$runCommandRaw({ ping: 1 });
    res.json({ status: 'ready', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'not_ready', error: 'Database not reachable' });
  }
});

// Prometheus Metrics Endpoint
app.get('/api/metrics', async (req: Request, res: Response) => {
  res.set('Content-Type', client.register.contentType);
  res.send(await client.register.metrics());
});

// Swagger UI Documentation
const swaggerDocument = YAML.load(path.join(__dirname, '../swagger.yaml'));
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.use(errorHandler);

export async function seedInitialData() {
  try {
    // No staff accounts are seeded. A deployment ships with the people the
    // owner actually creates — never with a login whose password is written in
    // the source, which anyone could read and use.
    //
    // A brand-new database still needs a way in, so the first owner is created
    // from the environment instead. Set BOOTSTRAP_OWNER_PASSWORD (plus
    // BOOTSTRAP_OWNER_USERNAME / _NAME / _PHONE if you want to control them) on
    // an empty database and start the server once; the account is created only
    // while no owner exists, and nothing happens when the variable is unset.
    const bootstrapPassword = process.env.BOOTSTRAP_OWNER_PASSWORD?.trim();
    if (bootstrapPassword) {
      const ownerCount = await prisma.user.count({ where: { role: Role.OWNER } });
      if (ownerCount === 0) {
        const bootstrapUsername = process.env.BOOTSTRAP_OWNER_USERNAME?.trim() || 'owner';
        const existingUsername = await prisma.user.findUnique({ where: { username: bootstrapUsername } });
        if (existingUsername) {
          logger.warn(
            { username: bootstrapUsername },
            'BOOTSTRAP_OWNER_PASSWORD is set but that username is already taken — no owner created.'
          );
        } else {
          const owner = await prisma.user.create({
            data: {
              name: process.env.BOOTSTRAP_OWNER_NAME?.trim() || 'Owner',
              role: Role.OWNER,
              username: bootstrapUsername,
              phone: process.env.BOOTSTRAP_OWNER_PHONE?.trim() || '',
              passwordHash: await hashPassword(bootstrapPassword),
              salaryAmount: 0,
            },
          });
          logger.info(
            { username: owner.username },
            'Created the initial owner from BOOTSTRAP_OWNER_* environment variables. Unset BOOTSTRAP_OWNER_PASSWORD now that you can sign in.'
          );
        }
      }
    }

    const menuCount = await prisma.menuItem.count();
    if (menuCount === 0) {
      logger.info('Seeding initial menu items...');
      await prisma.menuItem.createMany({
        data: [
          { name: 'Wagyu Gourmet Burger', category: MenuCategory.FOOD, price: 185.0, isAvailable: true },
          { name: 'Truffle Fries & Aioli', category: MenuCategory.FOOD, price: 95.0, isAvailable: true },
          { name: 'Woodfired Margherita Pizza', category: MenuCategory.FOOD, price: 160.0, isAvailable: true },
          { name: 'Artisanal Iced Matcha Latte', category: MenuCategory.DRINK, price: 65.0, isAvailable: true },
          { name: 'Fresh Sparkling Lemonade', category: MenuCategory.DRINK, price: 45.0, isAvailable: true },
          { name: 'Espresso Double Shot', category: MenuCategory.DRINK, price: 38.0, isAvailable: true },
          { name: 'Bottled Water 1L', category: MenuCategory.DRINK, price: 120.0, isAvailable: true },
          { name: 'Molten Chocolate Lava Cake', category: MenuCategory.DESSERT, price: 85.0, isAvailable: true },
          { name: 'Classic Tiramisu', category: MenuCategory.DESSERT, price: 75.0, isAvailable: true },
        ],
      });
      logger.info('Seeded default menu items.');
    }

    const businessDefaults: Record<string, string> = {
      taxRate: '0',
      managerDashboardEnabled: 'true',
      systemAdministrationEnabled: 'true',
      // Cashiers can manage the menu out of the box; a manager can restrict it.
      cashierMenuEditRestricted: 'false',
      // Owners and managers must each opt in before they can edit the menu, and
      // the two role switches are independent.
      ownerMenuEditEnabled: 'false',
      managerMenuEditEnabled: 'false',
    };
    for (const [key, value] of Object.entries(businessDefaults)) {
      const existing = await prisma.systemSetting.findUnique({ where: { key } });
      if (!existing) {
        await prisma.systemSetting.create({ data: { key, value } });
      }
    }
  } catch (err) {
    logger.warn({ err }, 'Seed check warning (DB might be connecting or uninitialized).');
  }
}
