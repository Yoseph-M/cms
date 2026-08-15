/**
 * Shared test helpers for backend integration tests.
 *
 * Provides:
 *  - getTestApp()  → the Express app wired to the in-memory MongoDB
 *  - seedTestUser() → creates a user and returns auth tokens
 *  - cleanDb()     → wipes all collections between tests
 */
import { PrismaClient, Role } from '@prisma/client';
import { app } from '../src/app';
import { hashPassword, generateAccessToken, generateRefreshToken } from '../src/utils/security';
import { authRateLimitStore } from '../src/modules/auth/auth.routes';

// Force Prisma to use the in-memory MongoDB URI set by globalSetup
let prisma: PrismaClient;

export function getPrisma(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL } },
    });
  }
  return prisma;
}

export function getTestApp() {
  return app;
}

export interface TestUser {
  id: string;
  name: string;
  role: Role;
  email: string;
  phone: string;
  accessToken: string;
  refreshToken: string;
}

/**
 * Creates a user in the DB and returns auth tokens for it.
 * All roles use password authentication.
 * 
 * For new tests, consider using factories.createUser() for data creation
 * and this function for authentication tokens.
 */
export async function seedTestUser(overrides: {
  name?: string;
  role?: Role;
  email?: string;
  phone?: string;
  salaryAmount?: number;
} = {}): Promise<TestUser> {
  const p = getPrisma();
  const name = overrides.name || 'Test User';
  const role = overrides.role || Role.OWNER;
  const email = overrides.email || `test-${Date.now()}-${Math.random().toString(36).slice(2)}@pos.com`;
  const phone = overrides.phone || `+1555${Date.now().toString().slice(-7)}`;
  const salaryAmount = overrides.salaryAmount ?? 3000;

  const passwordHash = await hashPassword('password123');

  const user = await p.user.create({
    data: {
      name,
      role,
      phone,
      email,
      passwordHash,
      salaryAmount,
    },
  });

  const tokenPayload = {
    userId: user.id,
    role: user.role,
    name: user.name,
    email: user.email,
  };
  const accessToken = generateAccessToken(tokenPayload);
  const refreshToken = generateRefreshToken(tokenPayload);

  return {
    id: user.id,
    name: user.name,
    role: user.role,
    email: user.email!,
    phone: user.phone,
    accessToken,
    refreshToken,
  };
}

/**
 * Wipes all data from all collections. Call between tests to ensure isolation.
 */
export async function cleanDb() {
  // Reset auth IP rate-limit counters so tests don't bleed into each other
  await authRateLimitStore.resetAll();

  const p = getPrisma();
  // Order matters due to relations — delete children first
  await p.settlement.deleteMany();
  await p.orderCancellationRequest.deleteMany();
  await p.refreshToken.deleteMany();
  await p.loginAttempt.deleteMany();
  await p.payrollAdjustment.deleteMany();
  await p.auditLog.deleteMany();
  await p.notification.deleteMany();
  await p.expense.deleteMany();
  await p.printerStation.deleteMany();
  await p.userPayment.deleteMany();
  await p.attendance.deleteMany();
  await p.order.deleteMany();
  await p.menuItem.deleteMany();
  await p.systemSetting.deleteMany();
  await p.user.deleteMany();
}

/**
 * Disconnect prisma after all tests in a file.
 */
export async function disconnectPrisma() {
  if (prisma) {
    await prisma.$disconnect();
  }
}

/**
 * Generate authentication tokens for an existing user.
 * Useful when using factories to create users.
 * 
 * @example
 * const user = await factories.createUser({ prisma }, { role: Role.CASHIER });
 * const tokens = generateTokensForUser(user);
 * const res = await request(app)
 *   .get('/api/orders')
 *   .set('Authorization', `Bearer ${tokens.accessToken}`);
 */
export function generateTokensForUser(user: {
  id: string;
  role: Role;
  name: string;
  email?: string | null;
}): { accessToken: string; refreshToken: string } {
  const tokenPayload = {
    userId: user.id,
    role: user.role,
    name: user.name,
    email: user.email || undefined,
  };

  return {
    accessToken: generateAccessToken(tokenPayload),
    refreshToken: generateRefreshToken(tokenPayload),
  };
}

/**
 * Create a complete test user with authentication (combines factory + tokens).
 * This is a convenience wrapper around factories.createUser + generateTokensForUser.
 * 
 * @example
 * const cashier = await createAuthenticatedUser({ prisma }, { 
 *   role: Role.CASHIER,
 *   email: 'cashier@test.com'
 * });
 * // Use cashier.accessToken in requests
 */
export async function createAuthenticatedUser(
  factoryOptions: { prisma: PrismaClient },
  userOptions: {
    name?: string;
    role?: Role;
    email?: string;
    phone?: string;
    salaryAmount?: number;
  } = {}
): Promise<TestUser> {
  const p = factoryOptions.prisma;
  const passwordHash = await hashPassword('password123');
  
  const user = await p.user.create({
    data: {
      name: userOptions.name || 'Test User',
      role: userOptions.role || Role.CASHIER,
      phone: userOptions.phone || `+1555${Date.now().toString().slice(-7)}`,
      email: userOptions.email || `test-${Date.now()}-${Math.random().toString(36).slice(2)}@pos.com`,
      passwordHash,
      salaryAmount: userOptions.salaryAmount ?? 3000,
    },
  });

  const tokens = generateTokensForUser(user);

  return {
    id: user.id,
    name: user.name,
    role: user.role,
    email: user.email!,
    phone: user.phone,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  };
}

/**
 * Centralized test users - create a standard set of authenticated users.
 * Useful for tests that need multiple roles.
 * 
 * @example
 * const users = await createTestUsers({ prisma });
 * const res = await request(app)
 *   .get('/api/orders')
 *   .set('Authorization', `Bearer ${users.owner.accessToken}`);
 */
export async function createTestUsers(factoryOptions: { prisma: PrismaClient }): Promise<{
  owner: TestUser;
  manager: TestUser;
  cashier: TestUser;
  waiter: TestUser;
}> {
  const [owner, manager, cashier, waiter] = await Promise.all([
    createAuthenticatedUser(factoryOptions, { 
      role: Role.OWNER, 
      email: 'owner@test.com',
      name: 'Test Owner',
    }),
    createAuthenticatedUser(factoryOptions, { 
      role: Role.MANAGER, 
      email: 'manager@test.com',
      name: 'Test Manager',
    }),
    createAuthenticatedUser(factoryOptions, { 
      role: Role.CASHIER, 
      email: 'cashier@test.com',
      name: 'Test Cashier',
    }),
    createAuthenticatedUser(factoryOptions, { 
      role: Role.WAITER, 
      email: 'waiter@test.com',
      name: 'Test Waiter',
    }),
  ]);

  return { owner, manager, cashier, waiter };
}
