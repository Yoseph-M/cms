import { PrismaClient, Role } from '@prisma/client';
import { getPrisma, cleanDb, disconnectPrisma } from './helpers';
import * as factories from './factories';
import {
  startDailyClose,
  approveDailyClose,
  rejectDailyClose,
  previewDailyClose,
  listDailyCloseHistory,
} from '../src/modules/daily-close/dailyClose.service';
import { getBusinessDayStart } from '../src/utils/businessTime';

describe('Daily Close — cashier request, manager decision', () => {
  let prisma: PrismaClient;
  let factory: factories.FactoryOptions;
  let manager: any;
  let cashier: any;
  let waiter: any;

  const BUSINESS_DATE = '2026-08-18';

  beforeAll(async () => {
    prisma = getPrisma();
    factory = { prisma };
  });

  beforeEach(async () => {
    await cleanDb();
    manager = await factories.createUser(factory, { role: Role.MANAGER });
    cashier = await factories.createUser(factory, { role: Role.CASHIER });
    waiter = await factories.createUser(factory, { role: Role.WAITER });
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  it('parks the day in PENDING_REVIEW and records who asked', async () => {
    const request = await startDailyClose({
      businessDate: BUSINESS_DATE,
      requestedById: cashier.id,
    });

    expect(request.status).toBe('PENDING_REVIEW');
    expect(request.requestedById).toBe(cashier.id);
    expect(request.requestedAt).toBeTruthy();

    // The manager is told there is something waiting for them.
    const alerts = await prisma.notification.findMany({ where: { type: 'DAILY_CLOSE_REQUESTED' } });
    expect(alerts.length).toBe(1);
  });

  it('previews only that date’s own sales — never another day, never cancelled tickets', async () => {
    const dayStart = getBusinessDayStart(new Date(BUSINESS_DATE));
    const midday = new Date(dayStart.getTime() + 12 * 60 * 60 * 1000);
    const yesterday = new Date(dayStart.getTime() - 60 * 60 * 1000);

    // Today's sale, fully paid in cash.
    const liveOrder = await factories.createOrder(factory, {
      waiterId: waiter.id,
      totalAmount: 1000,
    });
    await prisma.order.update({ where: { id: liveOrder.id }, data: { createdAt: midday } });
    const liveSettlement = await factories.createSettlement(factory, {
      orderId: liveOrder.id,
      amountMinor: 1000,
      recordedById: cashier.id,
    });
    await prisma.settlement.update({
      where: { id: liveSettlement.id },
      data: { createdAt: midday },
    });

    // A cancelled ticket the same day: not revenue.
    const cancelled = await factories.createOrder(factory, {
      waiterId: waiter.id,
      totalAmount: 500,
    });
    await prisma.order.update({
      where: { id: cancelled.id },
      data: { createdAt: midday, status: 'CANCELLED' },
    });

    // A big ticket from the day before: must not leak into today's figures.
    const stale = await factories.createOrder(factory, {
      waiterId: waiter.id,
      totalAmount: 9000,
    });
    await prisma.order.update({ where: { id: stale.id }, data: { createdAt: yesterday } });

    const preview = await previewDailyClose(BUSINESS_DATE);

    expect(preview.businessDate).toBe(BUSINESS_DATE);
    expect(preview.totalSalesMinor).toBe(1000);
    expect(preview.totalSettledMinor).toBe(1000);
    expect(preview.cashSettledMinor).toBe(1000);
    expect(preview.cardSettledMinor).toBe(0);
    expect(preview.unsettledOrderCount).toBe(1);
    expect(preview.cancelledOrderCount).toBe(1);

    // Previewing must not create or touch a DailyClose record.
    expect(
      await prisma.dailyClose.findUnique({ where: { businessDate: BUSINESS_DATE } }),
    ).toBeNull();
  });

  it('does not block the request on integrity issues', async () => {
    // An orphan settlement used to be a CRITICAL integrity issue that blocked
    // the close. Approval is the manager's call now, so it must not.
    await prisma.settlement.create({
      data: {
        orderId: '66c1b3e8c9e1b2a3d4e5f6a1',
        amountMinor: 1000,
        method: 'CASH',
        recordedById: cashier.id,
      },
    });

    await expect(
      startDailyClose({ businessDate: BUSINESS_DATE, requestedById: cashier.id }),
    ).resolves.toBeDefined();
  });

  it('lets the manager approve the request, locking the day', async () => {
    await startDailyClose({ businessDate: BUSINESS_DATE, requestedById: cashier.id });

    const closed = await approveDailyClose({
      businessDate: BUSINESS_DATE,
      decidedById: manager.id,
      reviewNotes: 'Counted and agreed.',
    });

    expect(closed.status).toBe('CLOSED');
    expect(closed.closedById).toBe(manager.id);
    expect(closed.reviewNotes).toBe('Counted and agreed.');

    const decisions = await prisma.notification.findMany({
      where: { type: 'DAILY_CLOSE_DECISION' },
    });
    expect(decisions.length).toBe(1);
    expect(decisions[0].recipientRole).toBe('CASHIER');
  });

  it('lets the manager disapprove the request, and the cashier can ask again', async () => {
    await startDailyClose({ businessDate: BUSINESS_DATE, requestedById: cashier.id });

    const rejected = await rejectDailyClose({
      businessDate: BUSINESS_DATE,
      decidedById: manager.id,
      reviewNotes: 'Two card payments are missing receipts.',
    });

    expect(rejected.status).toBe('REJECTED');
    expect(rejected.reviewNotes).toBe('Two card payments are missing receipts.');

    // A disapproved day is not locked: the request can be sent again.
    const retried = await startDailyClose({
      businessDate: BUSINESS_DATE,
      requestedById: cashier.id,
    });
    expect(retried.status).toBe('PENDING_REVIEW');
  });

  it('refuses to decide a request that was never sent', async () => {
    // No snapshot exists yet, so there is nothing to decide either way.
    await expect(
      approveDailyClose({ businessDate: BUSINESS_DATE, decidedById: manager.id }),
    ).rejects.toThrow(/not found|no open close request/i);

    await expect(
      rejectDailyClose({ businessDate: BUSINESS_DATE, decidedById: manager.id }),
    ).rejects.toThrow(/not found|no open close request/i);
  });

  it('never reopens a day that is already closed', async () => {
    await startDailyClose({ businessDate: BUSINESS_DATE, requestedById: cashier.id });
    await approveDailyClose({ businessDate: BUSINESS_DATE, decidedById: manager.id });

    await expect(
      startDailyClose({ businessDate: BUSINESS_DATE, requestedById: cashier.id }),
    ).rejects.toThrow(/already closed/i);

    const still = await prisma.dailyClose.findUnique({ where: { businessDate: BUSINESS_DATE } });
    expect(still?.status).toBe('CLOSED');
  });

  it('lists a newest-first revenue history with names and totals', async () => {
    const olderDate = '2026-08-10';

    await startDailyClose({ businessDate: olderDate, requestedById: cashier.id });
    await approveDailyClose({ businessDate: olderDate, decidedById: manager.id });
    await startDailyClose({ businessDate: BUSINESS_DATE, requestedById: cashier.id });

    const history = await listDailyCloseHistory();

    // Newest business date first.
    expect(history.map((r) => r.businessDate)).toEqual([BUSINESS_DATE, olderDate]);

    const older = history.find((r) => r.businessDate === olderDate)!;
    expect(older.status).toBe('CLOSED');
    expect(older.requestedByName).toBe(cashier.name);
    expect(older.closedByName).toBe(manager.name);
    expect(typeof older.totalSalesMinor).toBe('number');

    // Only the decided day counts as closed in the history feed.
    const pending = history.find((r) => r.businessDate === BUSINESS_DATE)!;
    expect(pending.status).toBe('PENDING_REVIEW');
  });
});
