import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import authRoutes from './modules/auth/auth.routes';
import usersRoutes from './modules/users/users.routes';
import menuRoutes from './modules/menu/menu.routes';
import ordersRoutes from './modules/orders/orders.routes';
import attendanceRoutes from './modules/attendance/attendance.routes';
import payrollRoutes from './modules/payroll/payroll.routes';
import analyticsRoutes from './modules/analytics/analytics.routes';
import printersRoutes from './modules/printers/printers.routes';
import { errorHandler } from './middleware/error.middleware';
import { prisma } from './services/prisma.service';
import { hashPin, hashPassword } from './utils/security';
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

app.use(helmet());
app.use(cors({ origin: '*', credentials: true }));
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
          phone: '+15550001',
          passwordHash: defaultPasswordHash,
          pinCodeHash: ownerPin.hash,
          pinSalt: ownerPin.salt,
          salaryAmount: 5000,
        },
      });

      const managerPin = hashPin('2222');
      const manager = await prisma.user.create({
        data: {
          name: 'Bob Manager',
          role: Role.MANAGER,
          email: 'manager@pos.com',
          phone: '+15550002',
          passwordHash: defaultPasswordHash,
          pinCodeHash: managerPin.hash,
          pinSalt: managerPin.salt,
          salaryAmount: 3500,
        },
      });

      const cashierPin = hashPin('3333');
      const cashier = await prisma.user.create({
        data: {
          name: 'Charlie Cashier',
          role: Role.CASHIER,
          email: 'cashier@pos.com',
          phone: '+15550003',
          passwordHash: defaultPasswordHash,
          pinCodeHash: cashierPin.hash,
          pinSalt: cashierPin.salt,
          salaryAmount: 2500,
        },
      });

      const waiterPin = hashPin('4444');
      const waiter = await prisma.user.create({
        data: {
          name: 'David Waiter',
          role: Role.WAITER,
          email: 'waiter@pos.com',
          phone: '+15550004',
          pinCodeHash: waiterPin.hash,
          pinSalt: waiterPin.salt,
          salaryAmount: 2000,
        },
      });

      logger.info({ owner: owner.email, manager: manager.email, cashier: cashier.email, waiter: waiter.email }, 'Seeded default staff accounts.');
    }

    // Backfill passwordHash for existing web-role users who are missing it
    const allWebRoles = await prisma.user.findMany({
      where: {
        role: { in: [Role.OWNER, Role.MANAGER, Role.CASHIER] },
      },
    });
    const webRolesWithoutPassword = allWebRoles.filter(u => !u.passwordHash);
    if (webRolesWithoutPassword.length > 0) {
      const backfillHash = await hashPassword('password123');
      for (const user of webRolesWithoutPassword) {
        await prisma.user.update({
          where: { id: user.id },
          data: { passwordHash: backfillHash },
        });
        logger.info({ name: user.name, role: user.role }, 'Backfilled passwordHash for user.');
      }
      logger.info(`Backfilled passwordHash for ${webRolesWithoutPassword.length} user(s). Default password: password123`);
    }

    const menuCount = await prisma.menuItem.count();
    if (menuCount === 0) {
      logger.info('Seeding initial menu items...');
      await prisma.menuItem.createMany({
        data: [
          { name: 'Wagyu Gourmet Burger', category: MenuCategory.FOOD, price: 18.50, isAvailable: true },
          { name: 'Truffle Fries & Aioli', category: MenuCategory.FOOD, price: 9.00, isAvailable: true },
          { name: 'Woodfired Margherita Pizza', category: MenuCategory.FOOD, price: 16.00, isAvailable: true },
          { name: 'Artisanal Iced Matcha Latte', category: MenuCategory.DRINK, price: 6.50, isAvailable: true },
          { name: 'Fresh Sparkling Lemonade', category: MenuCategory.DRINK, price: 4.50, isAvailable: true },
          { name: 'Espresso Double Shot', category: MenuCategory.DRINK, price: 3.80, isAvailable: true },
          { name: 'Molten Chocolate Lava Cake', category: MenuCategory.DESSERT, price: 8.50, isAvailable: true },
          { name: 'Classic Tiramisu', category: MenuCategory.DESSERT, price: 7.50, isAvailable: true },
        ],
      });
      logger.info('Seeded default menu items.');
    }
  } catch (err) {
    logger.warn({ err }, 'Seed check warning (DB might be connecting or uninitialized).');
  }
}
