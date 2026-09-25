import { PrismaClient, Role } from '@prisma/client';
import { getPrisma, cleanDb, disconnectPrisma } from './helpers';
import * as factories from './factories';
import {
  auditMenuPriceDrift,
  formatPriceDriftReport,
  formatItemPriceTrace,
  traceItemPrice,
} from '../src/modules/analytics/menuPriceAudit.service';

/**
 * Menu price drift audit.
 *
 * A price change must not rewrite history: the ticket keeps the price it was
 * sold at. But it does mean a dish's revenue stops describing "what this dish
 * costs", so the audit has to name every dish carrying off-price lines and say
 * how much of the paid revenue sits on them.
 */
describe('Menu price drift audit', () => {
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

  /** One paid ticket holding `qty` of `menuItem` at `unitPrice`. */
  const ticket = async (
    menuItem: { id: string; name: string },
    unitPrice: number,
    qty: number,
    status: 'PAID' | 'IN_KITCHEN' = 'PAID',
  ) =>
    factories.createOrder(factory, {
      waiterId: waiter.id,
      items: [{ menuItemId: menuItem.id, name: menuItem.name, unitPrice, quantity: qty }],
      status,
      ...(status === 'PAID' ? { settlementStatus: 'SETTLED' as const } : {}),
    });

  it('names every dish sold off its current price, worst distortion first', async () => {
    const doroWat = await factories.createMenuItem(factory, { name: 'Doro Wat', price: 450 });
    const macchiato = await factories.createMenuItem(factory, { name: 'Macchiato', price: 30 });
    const shiro = await factories.createMenuItem(factory, { name: 'Shiro', price: 200 });
    const misir = await factories.createMenuItem(factory, { name: 'Misir', price: 120 });

    // Doro Wat: two units at the old 380, one at today's 450.
    await ticket(doroWat, 380, 2);
    await ticket(doroWat, 450, 1);
    // Macchiato: ten units at 25, today's price is 30.
    await ticket(macchiato, 25, 10);
    // Shiro: sold at 280 above today's 200 — the history overstates it.
    await ticket(shiro, 280, 1);
    // Misir: every paid line matches the menu.
    await ticket(misir, 120, 3);
    // A ticket still in the kitchen at a third price is not revenue, so it can
    // not be part of the audit.
    await ticket(doroWat, 200, 5, 'IN_KITCHEN');

    const report = await auditMenuPriceDrift();

    expect(report.driftingDishCount).toBe(3);
    expect(report.driftingLineCount).toBe(3);
    expect(report.steadyDishCount).toBe(1);
    expect(report.removedDishes).toEqual([]);

    // Ordered by how far the dish moves a revenue figure.
    expect(report.dishes.map((d) => d.name)).toEqual(['Doro Wat', 'Shiro', 'Macchiato']);

    const doro = report.dishes[0];
    expect(doro.currentPrice).toBe(450);
    // The in-kitchen ticket's 200 is not in the paid history at all.
    expect(doro.lines.map((l) => l.unitPrice)).toEqual([450, 380]);
    expect(doro.totalQty).toBe(3);
    expect(doro.totalRevenueMinor).toBe(1210);
    expect(doro.driftingQty).toBe(2);
    expect(doro.driftingRevenueMinor).toBe(760);
    expect(doro.driftingAtCurrentPriceMinor).toBe(900);
    expect(doro.distortionMinor).toBe(140);

    // A price cut reports a negative distortion: the history overstates it.
    expect(report.dishes[1].distortionMinor).toBe(-80);
    expect(report.dishes[2].distortionMinor).toBe(50);

    // Every paid line counts towards the examined total (Misir's 360 included);
    // only the off-price lines move it.
    expect(report.totalRevenueMinor).toBe(2100);
    expect(report.distortionMinor).toBe(110);
  });

  it('reports a dish that left the menu without pretending it has a current price', async () => {
    const gone = await factories.createMenuItem(factory, { name: 'Legacy Combo', price: 700 });
    await ticket(gone, 600, 2);
    await prisma.menuItem.delete({ where: { id: gone.id } });

    const report = await auditMenuPriceDrift();

    expect(report.dishes).toEqual([]);
    expect(report.driftingDishCount).toBe(0);
    expect(report.removedDishes).toHaveLength(1);
    expect(report.removedDishes[0]).toMatchObject({
      name: 'Legacy Combo',
      qty: 2,
      revenueMinor: 1200,
    });
    // Its revenue is still part of the examined total.
    expect(report.totalRevenueMinor).toBe(1200);
  });

  it('says so plainly when no dish has drifted', async () => {
    const item = await factories.createMenuItem(factory, { name: 'Tibs', price: 300 });
    await ticket(item, 300, 4);

    const report = await auditMenuPriceDrift();
    const text = formatPriceDriftReport(report);

    expect(report.driftingDishCount).toBe(0);
    expect(report.distortionMinor).toBe(0);
    expect(text).toContain('No dish has a paid price that differs from its current menu price.');
    expect(text).toContain('1 dish(es) match their current menu price on every paid line.');
  });

  /* ── Drill-down: "13 sold, 624,000 ETB" on a 3,000 ETB dish ── */

  it('follows a best-seller figure back to the prices its tickets were rung up at', async () => {
    const item = await factories.createMenuItem(factory, { name: 'Beef Steak', price: 3000 });
    // 13 units rung up at 48,000 each — the only arithmetic that produces the
    // card's 624,000 for 13 sold.
    await factories.createOrder(factory, {
      waiterId: waiter.id,
      items: [{ menuItemId: item.id, name: 'Beef Steak', unitPrice: 48000, quantity: 13 }],
      totalAmount: 624000,
      status: 'PAID',
      settlementStatus: 'SETTLED',
    });

    const trace = await traceItemPrice('Beef Steak');

    expect(trace.menuItem?.price).toBe(3000);
    expect(trace.prices).toHaveLength(1);
    expect(trace.prices[0]).toMatchObject({ unitPrice: 48000, qty: 13, revenueMinor: 624000 });
    expect(trace.unitsSold).toBe(13);
    expect(trace.revenueMinor).toBe(624000);
    // What those units would have cost at the menu price shown today.
    expect(trace.atMenuPriceMinor).toBe(39000);
    // The ticket bills exactly what its lines add up to, so the money is real;
    // it is the recorded price that does not match the menu.
    expect(trace.mismatchedTicketCount).toBe(0);
    expect(trace.tickets[0].billedMismatch).toBe(false);

    const text = formatItemPriceTrace(trace);
    expect(text).toContain('Menu price today: 3,000 ETB');
    expect(text).toContain('48,000 ETB per unit on average');
    expect(text).toContain("At today's menu price those units would be 39,000 ETB.");
    expect(text).toContain('48,000 ETB × 13 = 624,000 ETB');
    expect(text).toContain('16.00× the menu price');
    // 48,000 is not a price decision — it is 16× the menu; the audit says so
    // plainly rather than leaving the reader to divide.
    expect(text).toContain('against 3,000 ETB on the menu');
  });

  it('names a line that is on the old cents scale — exactly 100× the menu price', async () => {
    const item = await factories.createMenuItem(factory, { name: 'Doro Wot', price: 1500 });
    // The pre-major-units scale: a 1,500 ETB dish recorded as 150,000.
    await factories.createOrder(factory, {
      waiterId: waiter.id,
      items: [{ menuItemId: item.id, name: 'Doro Wot', unitPrice: 150000, quantity: 4 }],
      totalAmount: 600000,
      status: 'PAID',
      settlementStatus: 'SETTLED',
    });

    const trace = await traceItemPrice('Doro Wot');
    const text = formatItemPriceTrace(trace);

    expect(text).toContain('100.00× the menu price (the old cents scale: 100×)');
    // …and the same note appears in the menu-wide report.
    const reportText = formatPriceDriftReport(await auditMenuPriceDrift());
    expect(reportText).toContain('150,000 ETB × 4 = 600,000 ETB');
    expect(reportText).toContain('(the old cents scale: 100×)');
  });

  it('names the tickets whose own lines do not add up to what they were billed', async () => {
    const item = await factories.createMenuItem(factory, { name: 'Beef Steak', price: 3000 });
    // A ticket billed at the menu price while its line carries another price:
    // the two disagree, and the item revenue is built on the line's figure.
    await factories.createOrder(factory, {
      waiterId: waiter.id,
      items: [{ menuItemId: item.id, name: 'Beef Steak', unitPrice: 48000, quantity: 13 }],
      totalAmount: 39000,
      status: 'PAID',
      settlementStatus: 'SETTLED',
    });

    const trace = await traceItemPrice('Beef Steak');
    expect(trace.mismatchedTicketCount).toBe(1);

    const text = formatItemPriceTrace(trace);
    expect(text).toContain('lines add up to 624,000 ETB but the ticket was billed 39,000 ETB');
    expect(text).toContain('1 ticket(s) do not bill what their own lines add up to');
  });

  it('traces a dish that is no longer on the menu, and one that was never sold', async () => {
    const gone = await factories.createMenuItem(factory, { name: 'Legacy Combo', price: 700 });
    await factories.createOrder(factory, {
      waiterId: waiter.id,
      items: [{ menuItemId: gone.id, name: 'Legacy Combo', unitPrice: 600, quantity: 2 }],
      totalAmount: 1200,
      status: 'PAID',
      settlementStatus: 'SETTLED',
    });
    await prisma.menuItem.delete({ where: { id: gone.id } });

    const removedTrace = await traceItemPrice('Legacy Combo');
    expect(removedTrace.menuItem).toBeNull();
    expect(removedTrace.atMenuPriceMinor).toBeNull();
    expect(removedTrace.revenueMinor).toBe(1200);
    expect(formatItemPriceTrace(removedTrace)).toContain('Not on the menu any more');

    // A dish nobody has paid for traces to an empty history rather than an error.
    const unsold = await factories.createMenuItem(factory, { name: 'New Dish', price: 500 });
    const unsoldTrace = await traceItemPrice('New Dish');
    expect(unsoldTrace.menuItem?.id).toBe(unsold.id);
    expect(unsoldTrace.tickets).toEqual([]);
    expect(unsoldTrace.unitsSold).toBe(0);
    expect(unsoldTrace.revenueMinor).toBe(0);
  });

  it('prints the off-price lines with the units and money behind them', async () => {
    const item = await factories.createMenuItem(factory, { name: 'Doro Wat', price: 450 });
    await ticket(item, 380, 2);
    await ticket(item, 450, 1);

    const text = formatPriceDriftReport(await auditMenuPriceDrift());

    expect(text).toContain('Doro Wat');
    expect(text).toContain('now 450 ETB');
    expect(text).toContain('380 ETB × 2 = 760 ETB');
    expect(text).toContain('(current)');
    expect(text).toContain('+140 ETB');
  });
});
