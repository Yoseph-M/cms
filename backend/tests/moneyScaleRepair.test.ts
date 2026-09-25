import { PrismaClient, Role } from '@prisma/client';
import { getPrisma, cleanDb, disconnectPrisma } from './helpers';
import * as factories from './factories';
import {
  findMoneyScaleOrders,
  formatMoneyScaleCandidates,
  repairMoneyScaleOrders,
} from '../src/services/moneyScaleRepair.service';

/**
 * Money-scale repair.
 *
 * Tickets left in the old cents scale inflate every revenue figure that reads
 * them (best sellers, trend, EOD snapshots). The repair has to find exactly
 * those tickets — a correctly priced 3,000 ETB ticket is 1× its menu price and
 * must never be divided down to 30 — and it must say what it will do before it
 * does it.
 */
describe('Money-scale repair', () => {
  let prisma: PrismaClient;
  let factory: factories.FactoryOptions;
  let waiter: any;

  beforeAll(async () => {
    prisma = getPrisma();
    factory = { prisma };
  });

  beforeEach(async () => {
    await cleanDb();
    waiter = await factories.createUser(factory, { role: Role.WAITER });
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  /** A ticket in the old cents scale: a 1,500 ETB dish rung up as 150,000. */
  const centsScaleTicket = async (menuItem: { id: string; name: string }, amountMinor: number) => {
    const macchiato = await factories.createMenuItem(factory, { name: 'Macchiato', price: 200 });
    const order = await factories.createOrder(factory, {
      waiterId: waiter.id,
      items: [
        { menuItemId: menuItem.id, name: menuItem.name, unitPrice: 150000, quantity: 4, notes: 'no onions' },
        { menuItemId: macchiato.id, name: 'Macchiato', unitPrice: 20000, quantity: 5, notes: '' },
      ],
      totalAmount: 700000,
      status: 'PAID',
      settlementStatus: 'SETTLED',
    });
    await factories.createSettlement(factory, {
      orderId: order.id,
      amountMinor,
      method: 'CASH',
      recordedById: waiter.id,
    });
    return order;
  };

  it('finds the tickets on the old scale and leaves correctly priced ones alone', async () => {
    const doroWat = await factories.createMenuItem(factory, { name: 'Doro Wot', price: 1500 });
    const macchiato = await factories.createMenuItem(factory, { name: 'Macchiato', price: 200 });
    await centsScaleTicket(doroWat, 700000);

    // A perfectly normal ticket at today's prices: 1× the menu, never touched.
    await factories.createOrder(factory, {
      waiterId: waiter.id,
      items: [
        { menuItemId: doroWat.id, name: 'Doro Wot', unitPrice: 1500, quantity: 2, notes: '' },
        { menuItemId: macchiato.id, name: 'Macchiato', unitPrice: 200, quantity: 2, notes: '' },
      ],
      totalAmount: 3400,
      status: 'PAID',
      settlementStatus: 'SETTLED',
    });

    const candidates = await findMoneyScaleOrders();

    expect(candidates).toHaveLength(1);
    expect(candidates[0].totalAmount).toBe(700000);
    expect(candidates[0].repairedTotalAmount).toBe(7000);
    expect(candidates[0].reason).toContain("Doro Wot: 150,000 is 100× today's menu price of 1,500");
    expect(candidates[0].lines.map((l) => l.repairedUnitPrice)).toEqual([1500, 200]);
    expect(candidates[0].settlements.map((s) => s.repairedAmountMinor)).toEqual([7000]);

    // The dry-run text is what a reviewer reads before saying yes.
    const text = formatMoneyScaleCandidates(candidates);
    expect(text).toContain('hold prices in the old cents scale');
    expect(text).toContain('billed 700,000 ETB → 7,000 ETB');
    expect(text).toContain('Doro Wot  150,000 ETB → 1,500 ETB × 4');
    expect(text).toContain('payment CASH  700,000 ETB → 7,000 ETB');
  });

  it('repairs a mixed ticket line by line and keeps the bill equal to its lines', async () => {
    const blackTea = await factories.createMenuItem(factory, { name: 'Black Tea', price: 300 });
    const burger = await factories.createMenuItem(factory, { name: 'Burger with Fries', price: 2000 });

    // A ticket rung up while the migration was half-applied: the drink is still
    // cents (10,000 = 100 ETB), the burger is already major units (2,000).
    const order = await factories.createOrder(factory, {
      waiterId: waiter.id,
      items: [
        { menuItemId: blackTea.id, name: 'Black Tea', unitPrice: 10000, quantity: 1, notes: '' },
        { menuItemId: burger.id, name: 'Burger with Fries', unitPrice: 2000, quantity: 1, notes: '' },
      ],
      totalAmount: 12000,
      status: 'PAID',
      settlementStatus: 'SETTLED',
    });
    await factories.createSettlement(factory, {
      orderId: order.id,
      amountMinor: 12000,
      method: 'CASH',
      recordedById: waiter.id,
    });

    const [candidate] = await findMoneyScaleOrders();
    expect(candidate.lines.map((l) => [l.name, l.flagged, l.repairedUnitPrice])).toEqual([
      ['Black Tea', true, 100],
      ['Burger with Fries', false, 2000],
    ]);
    // 12,000 − 9,900 = 2,100, and 100 + 2,000 = 2,100: the bill still matches
    // its own lines, which a blind ÷100 of the total would have broken.
    expect(candidate.repairedTotalAmount).toBe(2100);
    expect(candidate.settlements[0]).toMatchObject({ action: 'match-total', repairedAmountMinor: 2100 });

    await repairMoneyScaleOrders([order.id]);

    const repaired = await prisma.order.findUnique({
      where: { id: order.id },
      include: { settlements: true },
    });
    expect(repaired?.items.map((i) => i.unitPrice)).toEqual([100, 2000]);
    expect(repaired?.totalAmount).toBe(2100);
    expect(repaired?.settlements[0].amountMinor).toBe(2100);
  });

  it('rewrites the lines, the billed total and the payments, then finds nothing left', async () => {
    const doroWat = await factories.createMenuItem(factory, { name: 'Doro Wot', price: 1500 });
    const order = await centsScaleTicket(doroWat, 700000);

    const result = await repairMoneyScaleOrders();

    expect(result.repaired).toBe(1);
    expect(result.settlementsRepaired).toBe(1);

    const repaired = await prisma.order.findUnique({
      where: { id: order.id },
      include: { settlements: true },
    });
    expect(repaired?.totalAmount).toBe(7000);
    expect(repaired?.items.map((i) => i.unitPrice)).toEqual([1500, 200]);
    // The parts of a line that are not money survive the rewrite untouched.
    expect(repaired?.items[0].name).toBe('Doro Wot');
    expect(repaired?.items[0].quantity).toBe(4);
    expect(repaired?.items[0].notes).toBe('no onions');
    expect(repaired?.items[0].menuItemId).toBe(doroWat.id);
    expect(repaired?.settlements[0].amountMinor).toBe(7000);

    // Idempotent: nothing reads as the old scale any more.
    expect(await findMoneyScaleOrders()).toEqual([]);
  });

  it('can be narrowed to the tickets a reviewer picked', async () => {
    const doroWat = await factories.createMenuItem(factory, { name: 'Doro Wot', price: 1500 });
    const first = await centsScaleTicket(doroWat, 700000);
    const second = await centsScaleTicket(doroWat, 700000);

    const result = await repairMoneyScaleOrders([second.id]);

    expect(result.inspected).toBe(2);
    expect(result.repaired).toBe(1);
    const untouched = await prisma.order.findUnique({ where: { id: first.id } });
    expect(untouched?.totalAmount).toBe(700000);
  });

  it('reports an empty result instead of guessing when nothing qualifies', async () => {
    const doroWat = await factories.createMenuItem(factory, { name: 'Doro Wot', price: 1500 });
    await factories.createOrder(factory, {
      waiterId: waiter.id,
      items: [{ menuItemId: doroWat.id, name: 'Doro Wot', unitPrice: 1500, quantity: 1, notes: '' }],
      totalAmount: 1500,
      status: 'PAID',
      settlementStatus: 'SETTLED',
    });

    expect(await findMoneyScaleOrders()).toEqual([]);
    expect(formatMoneyScaleCandidates([])).toContain('0 ticket(s) hold prices in the old cents scale');
  });
});
