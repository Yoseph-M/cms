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
import { errorHandler } from './middleware/error.middleware';
import { prisma } from './services/prisma.service';
import { hashPin, hashPassword } from './utils/security';
import { Role, MenuCategory } from '@prisma/client';
import { logger, requestContext } from './utils/logger';
import { ensureDefaultPrinters } from './services/printer.service';
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

const allowedOrigins =
  config.nodeEnv === 'production'
    ? [config.webAppUrl, ...config.extraCorsOrigins].filter(Boolean)
    : [
        'http://localhost:3000',
        'http://localhost:5173',
        config.webAppUrl,
        ...config.extraCorsOrigins,
      ].filter((v, i, a) => Boolean(v) && a.indexOf(v) === i);

app.use(helmet());
app.use(compression());
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow non-browser clients (curl, server-to-server) with no Origin header
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
  })
);
app.use(express.json());

// Request ID & Context Threading
app.use((req: Request, res: Response, next: NextFunction) => {
  const requestId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
  res.setHeader('X-Request-ID', requestId);
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

// API Route mounts
app.use('/api', apiLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/settings/printers', printersRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/expenses', expensesRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/search', searchRoutes);

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date(), service: 'MERN POS API' });
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
    const userCount = await prisma.user.count();
    if (userCount === 0) {
      logger.info('No users found in database. Seeding initial staff accounts...');

      const defaultPasswordHash = await hashPassword('password123');

      const ownerPin = hashPin('1111');
      const owner = await prisma.user.create({
        data: {
          name: 'Alice Owner',
          role: Role.OWNER,
          email: 'owner@pos.com',
          phone: '+251911000001',
          passwordHash: defaultPasswordHash,
          pinCodeHash: ownerPin.hash,
          pinSalt: ownerPin.salt,
          salaryAmount: 45000,
        },
      });

      const managerPin = hashPin('2222');
      const manager = await prisma.user.create({
        data: {
          name: 'Bob Manager',
          role: Role.MANAGER,
          email: 'manager@pos.com',
          phone: '+251911000002',
          passwordHash: defaultPasswordHash,
          pinCodeHash: managerPin.hash,
          pinSalt: managerPin.salt,
          salaryAmount: 30000,
        },
      });

      const cashierPin = hashPin('3333');
      const cashier = await prisma.user.create({
        data: {
          name: 'Charlie Cashier',
          role: Role.CASHIER,
          email: 'cashier@pos.com',
          phone: '+251911000003',
          passwordHash: defaultPasswordHash,
          pinCodeHash: cashierPin.hash,
          pinSalt: cashierPin.salt,
          salaryAmount: 18000,
        },
      });

      const waiterPin = hashPin('4444');
      const waiter = await prisma.user.create({
        data: {
          name: 'David Waiter',
          role: Role.WAITER,
          email: 'waiter@pos.com',
          phone: '+251911000004',
          pinCodeHash: waiterPin.hash,
          pinSalt: waiterPin.salt,
          salaryAmount: 12000,
        },
      });

      logger.info({ owner: owner.email, manager: manager.email, cashier: cashier.email, waiter: waiter.email }, 'Seeded default staff accounts.');
    }

    // Intentionally no password backfill here — never auto-set password123 on existing accounts.
    // Demo users above are created with passwords only on a fresh empty database.

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
          { name: 'Molten Chocolate Lava Cake', category: MenuCategory.DESSERT, price: 85.0, isAvailable: true },
          { name: 'Classic Tiramisu', category: MenuCategory.DESSERT, price: 75.0, isAvailable: true },
        ],
      });
      logger.info('Seeded default menu items.');
    }

    await ensureDefaultPrinters();

    const cashierSetting = await prisma.systemSetting.findUnique({
      where: { key: 'cashierOrderingEnabled' },
    });
    if (!cashierSetting) {
      await prisma.systemSetting.create({
        data: { key: 'cashierOrderingEnabled', value: 'false' },
      });
      logger.info('Seeded cashierOrderingEnabled system setting (default: off).');
    }

    const businessDefaults: Record<string, string> = {
      businessName: 'Enterprise POS Restaurant',
      businessAddress: '123 Culinary Boulevard, Suite 100',
      businessPhone: '+1 (555) 019-2831',
      taxRate: '0',
      currency: 'ETB',
      receiptFooter: 'Thank you for dining with us!',
      receiptLogo: '',
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
