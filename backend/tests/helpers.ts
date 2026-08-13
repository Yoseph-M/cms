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
 */
export async function seedTestUser(overrides: {
  name?: string;
  role?: Role;
  email?: string;
  phone?: string;
} = {}): Promise<TestUser> {
  const p = getPrisma();
  const name = overrides.name || 'Test User';
  const role = overrides.role || Role.OWNER;
  const email = overrides.email || `test-${Date.now()}-${Math.random().toString(36).slice(2)}@pos.com`;
  const phone = overrides.phone || `+1555${Date.now().toString().slice(-7)}`;

  const passwordHash = await hashPassword('password123');

  const user = await p.user.create({
    data: {
      name,
      role,
      phone,
      email,
      passwordHash,
      salaryAmount: 3000,
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
