/**
 * Reset (format) tests.
 *
 * The reset is the only endpoint in the app that deletes in bulk, so its two
 * promises are pinned here: it needs an Owner plus an explicit confirmation,
 * and it clears the operational books without touching the accounts, menu,
 * settings or audit trail an operator would need to keep working.
 */
import request from 'supertest';
import { Role } from '@prisma/client';
import { getTestApp, getPrisma, seedTestUser, cleanDb, disconnectPrisma } from './helpers';
import * as factories from './factories';
import { resetPreview } from '../src/modules/backup/backup.service';

const app = getTestApp();

beforeEach(async () => {
  await cleanDb();
});

afterAll(async () => {
  await disconnectPrisma();
});

/** One order + settlement + expense + attendance row, plus kept records. */
async function seedOperationalData() {
  const prisma = getPrisma();
  const owner = await seedTestUser({ role: Role.OWNER, username: 'reset-owner' });
  const cashier = await seedTestUser({ role: Role.CASHIER, username: 'reset-cashier' });
  const waiter = await seedTestUser({ role: Role.WAITER, username: 'reset-waiter' });

  const factory: factories.FactoryOptions = { prisma };
  const order = await factories.createOrder(factory, { waiterId: waiter.id, totalAmount: 1000 });
  await factories.createSettlement(factory, {
    orderId: order.id,
    amountMinor: 1000,
    recordedById: cashier.id,
  });
  await prisma.expense.create({
    data: { category: 'SUPPLIES', amount: 250, description: 'Napkins', date: new Date(), recordedById: owner.id },
  });
  await prisma.attendance.create({
    data: { userId: cashier.id, date: '2026-09-18', status: 'PRESENT', source: 'MANUAL' },
  });
  const menuItem = await prisma.menuItem.create({
    data: { name: 'Kept Dish', category: 'FOOD', price: 150, isAvailable: true },
  });
  const setting = await prisma.systemSetting.create({ data: { key: 'taxRate', value: '15' } });

  return { owner, cashier, menuItem, setting };
}

describe('POST /api/backup/reset', () => {
  it('refuses to run without the explicit confirmation token', async () => {
    const { owner } = await seedOperationalData();

    const res = await request(app)
      .post('/api/backup/reset')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('RESET');
    // Nothing was deleted.
    expect(await getPrisma().order.count()).toBe(1);
  });

  it('stays Owner-only', async () => {
    const { cashier } = await seedOperationalData();

    const res = await request(app)
      .post('/api/backup/reset')
      .set('Authorization', `Bearer ${cashier.accessToken}`)
      .send({ confirm: 'RESET' });

    expect(res.status).toBe(403);
    expect(await getPrisma().order.count()).toBe(1);
  });

  it('deletes the operational books but keeps accounts, menu, settings and logs', async () => {
    const { owner, menuItem, setting } = await seedOperationalData();
    const prisma = getPrisma();

    const res = await request(app)
      .post('/api/backup/reset')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ confirm: 'RESET' });

    expect(res.status).toBe(200);
    expect(res.body.deleted).toBeGreaterThan(0);

    // Gone: the day-to-day records.
    expect(await prisma.order.count()).toBe(0);
    expect(await prisma.settlement.count()).toBe(0);
    expect(await prisma.expense.count()).toBe(0);
    expect(await prisma.attendance.count()).toBe(0);

    // Kept: the operator can still sign in and run the shop.
    expect(await prisma.user.findUnique({ where: { id: owner.id } })).not.toBeNull();
    expect(await prisma.menuItem.findUnique({ where: { id: menuItem.id } })).not.toBeNull();
    expect(await prisma.systemSetting.findUnique({ where: { key: setting.key } })).not.toBeNull();
    // The reset itself is auditable.
    expect(
      await prisma.auditLog.count({ where: { actionType: 'SYSTEM_DATA_RESET' } }),
    ).toBe(1);
  });
});

describe('reset preview', () => {
  it('reports what would be deleted and what is kept', async () => {
    await seedOperationalData();

    const preview = await resetPreview();

    const orders = preview.collections.find((item) => item.key === 'orders');
    expect(orders?.rows).toBe(1);
    expect(preview.rows).toBeGreaterThan(0);
    expect(preview.keeps).toContain('Staff accounts and roles');
  });
});
