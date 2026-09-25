import { PrismaClient, Role } from '@prisma/client';
import { getPrisma, cleanDb, disconnectPrisma } from './helpers';
import * as factories from './factories';
import {
  startDailyClose,
  approveDailyClose,
  rejectDailyClose,
  previewDailyClose,
  listDailyCloseHistory,
  reconcileClosedDays,
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

  it('previews only that date’s own sales — never another day, never cancelled or unpaid tickets', async () => {
    const dayStart = getBusinessDayStart(new Date(BUSINESS_DATE));
    const midday = new Date(dayStart.getTime() + 12 * 60 * 60 * 1000);
    const yesterday = new Date(dayStart.getTime() - 60 * 60 * 1000);

    // Today's sale, fully paid in cash (what settlement.service writes when the
    // last payment settles a ticket).
    const liveOrder = await factories.createOrder(factory, {
      waiterId: waiter.id,
      totalAmount: 1000,
      status: 'PAID',
      settlementStatus: 'SETTLED',
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

    // Food that went out but was never paid for: counted as an unsettled
    // ticket, never as revenue.
    const unpaid = await factories.createOrder(factory, {
      waiterId: waiter.id,
      totalAmount: 700,
      status: 'SERVED',
    });
    await prisma.order.update({ where: { id: unpaid.id }, data: { createdAt: midday } });

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

  it('never books a voided ticket as collected money', async () => {
    const dayStart = getBusinessDayStart(new Date(BUSINESS_DATE));
    const midday = new Date(dayStart.getTime() + 12 * 60 * 60 * 1000);

    // The day really took 1,000: one paid ticket, paid in cash.
    const paid = await factories.createOrder(factory, {
      waiterId: waiter.id,
      totalAmount: 1000,
      status: 'PAID',
      settlementStatus: 'SETTLED',
    });
    await prisma.order.update({ where: { id: paid.id }, data: { createdAt: midday } });
    const collection = await factories.createSettlement(factory, {
      orderId: paid.id,
      amountMinor: 1000,
      recordedById: cashier.id,
    });
    await prisma.settlement.update({
      where: { id: collection.id },
      data: { createdAt: midday },
    });

    // A ticket nobody ever paid for, cancelled the same day. The cancellation
    // writes a VOID row (method NONE) carrying the ticket's whole value so the
    // void shows in the settlement history — it is an audit entry, not money.
    const voided = await factories.createOrder(factory, {
      waiterId: waiter.id,
      totalAmount: 900,
    });
    await prisma.order.update({
      where: { id: voided.id },
      data: { createdAt: midday, status: 'CANCELLED' },
    });
    const voidRow = await factories.createSettlement(factory, {
      orderId: voided.id,
      amountMinor: 900,
      method: 'NONE',
      recordedById: cashier.id,
      reference: 'VOID',
    });
    await prisma.settlement.update({
      where: { id: voidRow.id },
      data: { createdAt: midday },
    });

    const preview = await previewDailyClose(BUSINESS_DATE);

    expect(preview.totalSalesMinor).toBe(1000);
    // "Total settled" is money that changed hands: the voided 900 never did.
    expect(preview.totalSettledMinor).toBe(1000);
    expect(preview.cashSettledMinor).toBe(1000);
    // The voided value is still on the record — just not as collected money.
    expect(preview.otherSettledMinor).toBe(900);
    expect(preview.cancelledOrderCount).toBe(1);
  });

  /* ── Reconciliation: each closed day's takings against that day's paid
        revenue, with the days that no longer agree flagged. ── */

  /** A PAID ticket of `amount` created at noon on the given business date. */
  const paidTicketOn = async (businessDate: string, amount: number) => {
    const noon = new Date(getBusinessDayStart(new Date(businessDate)).getTime() + 12 * 60 * 60 * 1000);
    const order = await factories.createOrder(factory, {
      waiterId: waiter.id,
      totalAmount: amount,
      status: 'PAID',
      settlementStatus: 'SETTLED',
    });
    await prisma.order.update({ where: { id: order.id }, data: { createdAt: noon } });
    return order;
  };

  const closeDay = async (businessDate: string) => {
    await startDailyClose({ businessDate, requestedById: cashier.id });
    await approveDailyClose({ businessDate, decidedById: manager.id });
  };

  it('flags a closed day whose paid revenue no longer matches the close', async () => {
    const quieterDate = '2026-08-10';

    await paidTicketOn(BUSINESS_DATE, 1000);
    await paidTicketOn(quieterDate, 500);
    await closeDay(quieterDate);
    await closeDay(BUSINESS_DATE);

    // Nothing that is not money may push a day off its close: a ticket still on
    // the floor, a voided one, and a paid ticket on an in-between day that
    // nobody ever closed.
    const open = await factories.createOrder(factory, {
      waiterId: waiter.id,
      totalAmount: 700,
      status: 'SERVED',
    });
    const voided = await factories.createOrder(factory, { waiterId: waiter.id, totalAmount: 900 });
    await prisma.order.update({
      where: { id: voided.id },
      data: { status: 'CANCELLED' },
    });
    await paidTicketOn('2026-08-12', 200);

    // …then 300 birr lands on the already-closed day.
    await paidTicketOn(BUSINESS_DATE, 300);

    const report = await reconcileClosedDays();

    // Newest closed day first, and only closed days.
    expect(report.days.map((d) => d.businessDate)).toEqual([BUSINESS_DATE, quieterDate]);
    expect(report.closedDayCount).toBe(2);
    expect(report.flaggedCount).toBe(1);

    const flagged = report.days[0];
    expect(flagged.flagged).toBe(true);
    expect(flagged.closedSalesMinor).toBe(1000);
    expect(flagged.paidRevenueMinor).toBe(1300);
    expect(flagged.deltaMinor).toBe(-300);
    expect(flagged.deltaPercent).toBe(-23.1);
    expect(flagged.closedByName).toBe(manager.name);
    expect(typeof open.id).toBe('string');

    // The quiet day still agrees with its own close.
    const agreeing = report.days[1];
    expect(agreeing.flagged).toBe(false);
    expect(agreeing.paidRevenueMinor).toBe(500);
    expect(agreeing.deltaMinor).toBe(0);

    // The in-between day's 200 birr belongs to neither closed day.
    expect(report.totals).toEqual({
      closedSalesMinor: 1500,
      paidRevenueMinor: 1800,
      deltaMinor: -300,
    });
  });

  it('reports an untouched day with no ledger money as a match, not a divergence', async () => {
    await closeDay(BUSINESS_DATE);

    const report = await reconcileClosedDays();

    expect(report.days.map((d) => d.businessDate)).toEqual([BUSINESS_DATE]);
    expect(report.days[0].closedSalesMinor).toBe(0);
    expect(report.days[0].paidRevenueMinor).toBe(0);
    expect(report.days[0].deltaPercent).toBeNull();
    expect(report.flaggedCount).toBe(0);
  });

  it('answers an empty window instead of failing when nothing has been closed', async () => {
    const report = await reconcileClosedDays();

    expect(report.days).toEqual([]);
    expect(report.closedDayCount).toBe(0);
    expect(report.flaggedCount).toBe(0);
    expect(report.totals).toEqual({ closedSalesMinor: 0, paidRevenueMinor: 0, deltaMinor: 0 });
  });
});
