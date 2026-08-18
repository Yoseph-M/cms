import { PrismaClient, IntegritySeverity, IntegrityCategory, Role } from '@prisma/client';
import { getPrisma, cleanDb, disconnectPrisma } from './helpers';
import * as factories from './factories';
import { startDailyClose } from '../src/modules/daily-close/dailyClose.service';

describe('Daily Close Service Integration Tests', () => {
  let prisma: PrismaClient;
  let factory: factories.FactoryOptions;
  let owner: any;
  let cashier: any;
  let waiter: any;

  beforeAll(async () => {
    prisma = getPrisma();
    factory = { prisma };
  });

  beforeEach(async () => {
    await cleanDb();
    owner = await factories.createUser(factory, { role: Role.OWNER });
    cashier = await factories.createUser(factory, { role: Role.CASHIER });
    waiter = await factories.createUser(factory, { role: Role.WAITER });
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  it('should block daily close if there are unresolved critical integrity issues', async () => {
    // Create an orphan settlement (Critical issue)
    await prisma.settlement.create({
      data: {
        orderId: '66c1b3e8c9e1b2a3d4e5f6a1',
        amountMinor: 1000,
        method: 'CASH',
        recordedById: cashier.id,
      }
    });

    // Attempt to start daily close
    await expect(startDailyClose({ businessDate: '2026-08-18' })).rejects.toThrow(/Cannot start daily close. .* integrity issues must be resolved first/);
  });

  it('should allow daily close if there are only non-critical issues', async () => {
    // Over-settlement is ERROR, not CRITICAL (per integrity.service.ts)
    const order = await factories.createOrder(factory, {
      waiterId: waiter.id,
      totalAmount: 1000,
    });
    await factories.createSettlement(factory, {
      orderId: order.id,
      amountMinor: 1200,
      recordedById: cashier.id,
    });

    // This should still allow daily close if the code only blocks on CRITICAL
    await expect(startDailyClose({ businessDate: '2026-08-18' })).resolves.toBeDefined();
  });
});
