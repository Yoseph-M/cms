/**
 * Menu price drift audit.
 *
 * Order lines carry the price a dish was sold at (`items.unitPrice`), which is
 * snapshotted when the ticket is priced. The menu carries today's price. When
 * someone changes a dish's price, historical tickets keep the price they were
 * sold at — that is correct, but it means the item's revenue figures no longer
 * describe "what this dish costs". This audit finds every dish whose history
 * contains prices that differ from today's menu price, and quantifies how much
 * of the past revenue sits on those lines.
 *
 * The distortion is what the same units would have brought in at the current
 * price:
 *
 *   distortion = (current price × drifting units) − (their historical revenue)
 *
 * A POSITIVE distortion means the menu price went up, so those old sales
 * understate what that dish is worth today; a NEGATIVE one means the price came
 * down (or the dish was discounted on the floor) and the history overstates it.
 *
 * Only PAID tickets are counted: nothing else ever entered a revenue figure, so
 * only paid lines can be the reason a revenue number reads the way it does.
 *
 * Read-only. Nothing here writes, and no endpoint exposes it — it exists to be
 * run by hand (`scripts/audit-menu-price-drift.ts`) when the numbers on the
 * item-sales pages need explaining.
 */

import { prisma } from '../../services/prisma.service';

/** Name key that ignores case, a bilingual tail and extra spacing. */
function nameKey(name: unknown): string {
  return String(name ?? '')
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** One distinct price a dish was sold at, with what it brought in. */
export interface PriceDriftLine {
  /** The price on the order line — what those units were actually sold for. */
  unitPrice: number;
  qty: number;
  revenueMinor: number;
  /** How many paid tickets carried at least one unit at this price. */
  orders: number;
}

/** A dish whose history disagrees with its current menu price. */
export interface DishPriceDrift {
  menuItemId: string;
  name: string;
  category: string;
  /** Today's menu price. `null` for a dish that is no longer on the menu. */
  currentPrice: number | null;
  /** Units sold at every price, current one included. */
  totalQty: number;
  /** Paired with `totalQty`: all of the dish's paid revenue. */
  totalRevenueMinor: number;
  /** Units sold at a price that is not today's. */
  driftingQty: number;
  driftingRevenueMinor: number;
  /** What those drifting units would bring in at today's price. */
  driftingAtCurrentPriceMinor: number;
  /** `driftingAtCurrentPriceMinor − driftingRevenueMinor`, signed. */
  distortionMinor: number;
  /** Every price the dish was sold at, dearest first. */
  lines: PriceDriftLine[];
}

export interface PriceDriftReport {
  /** Dishes with at least one line off the current price, worst distortion first. */
  dishes: DishPriceDrift[];
  /** Dishes whose every paid line matches today's menu price. */
  steadyDishCount: number;
  /** Dishes no longer on the menu but still present in paid history. */
  removedDishes: Array<{ menuItemId: string; name: string; qty: number; revenueMinor: number }>;
  driftingLineCount: number;
  driftingDishCount: number;
  totalRevenueMinor: number;
  /** Signed: how much of the paid history reads differently at today's prices. */
  distortionMinor: number;
}

/** MongoDB returns ids and numbers wrapped at times; unwrap whatever shows up. */
function unwrapId(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if ('$oid' in o) return String(o.$oid);
    if ('$numberLong' in o) return String(o.$numberLong);
  }
  return String(value);
}

/** `createdAt` arrives as a Date from Prisma or as `{ $date: … }` from raw. */
function unwrapDate(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  if (value !== null && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (typeof o.$date === 'string') return o.$date;
    if (o.$date instanceof Date) return o.$date.toISOString();
    if (typeof o.$date === 'object' && o.$date !== null) {
      const inner = (o.$date as Record<string, unknown>).$numberLong;
      if (inner !== undefined) return new Date(Number(inner)).toISOString();
    }
  }
  return null;
}

function unwrapNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (value !== null && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if ('$numberLong' in o) return Number(o.$numberLong);
    if ('$numberInt' in o) return Number(o.$numberInt);
    if ('$numberDouble' in o) return Number(o.$numberDouble);
    if ('$numberDecimal' in o) return Number(o.$numberDecimal);
  }
  return Number(value ?? 0);
}

interface RawPriceLine {
  menuItemId?: unknown;
  name?: unknown;
  unitPrice?: unknown;
  qty?: unknown;
  revenue?: unknown;
  orders?: unknown;
}

/**
 * Compare every dish's paid order-line prices with its current menu price.
 *
 * The order-line side is aggregated in Mongo (one row per dish × price), so the
 * audit does not pull the whole order history into memory.
 */
export async function auditMenuPriceDrift(): Promise<PriceDriftReport> {
  const [menuItems, rawLines] = await Promise.all([
    prisma.menuItem.findMany({ select: { id: true, name: true, category: true, price: true } }),
    prisma.order.aggregateRaw({
      pipeline: [
        // Paid tickets only: these are the lines that make up a revenue figure.
        { $match: { status: 'PAID' } },
        { $unwind: '$items' },
        {
          $group: {
            _id: {
              menuItemId: '$items.menuItemId',
              unitPrice: '$items.unitPrice',
            },
            // The newest spelling of the name wins, so a renamed dish reports
            // under the name the menu uses today.
            name: { $last: '$items.name' },
            qty: { $sum: '$items.quantity' },
            revenue: { $sum: { $multiply: ['$items.unitPrice', '$items.quantity'] } },
            orders: { $sum: 1 },
          },
        },
        {
          $project: {
            _id: 0,
            menuItemId: '$_id.menuItemId',
            unitPrice: '$_id.unitPrice',
            name: 1,
            qty: 1,
            revenue: 1,
            orders: 1,
          },
        },
      ] as never,
    }),
  ]);

  const menuById = new Map(menuItems.map((item) => [item.id, item]));
  const byDish = new Map<string, { name: string; lines: Map<number, PriceDriftLine> }>();

  for (const row of (rawLines as unknown as RawPriceLine[]) ?? []) {
    const menuItemId = unwrapId(row.menuItemId);
    if (!menuItemId) continue;
    const unitPrice = unwrapNumber(row.unitPrice);
    const entry =
      byDish.get(menuItemId) ??
      byDish
        .set(menuItemId, { name: String(row.name ?? ''), lines: new Map() })
        .get(menuItemId)!;

    const line = entry.lines.get(unitPrice) ?? { unitPrice, qty: 0, revenueMinor: 0, orders: 0 };
    line.qty += unwrapNumber(row.qty);
    line.revenueMinor += unwrapNumber(row.revenue);
    line.orders += unwrapNumber(row.orders);
    entry.lines.set(unitPrice, line);
  }

  const dishes: DishPriceDrift[] = [];
  const removedDishes: PriceDriftReport['removedDishes'] = [];
  let steadyDishCount = 0;
  let driftingLineCount = 0;
  let totalRevenueMinor = 0;
  let distortionMinor = 0;

  for (const [menuItemId, entry] of byDish) {
    const menuItem = menuById.get(menuItemId);
    const lines = [...entry.lines.values()].sort((a, b) => b.unitPrice - a.unitPrice);
    const totalQty = lines.reduce((sum, l) => sum + l.qty, 0);
    const dishRevenue = lines.reduce((sum, l) => sum + l.revenueMinor, 0);
    totalRevenueMinor += dishRevenue;

    if (!menuItem) {
      // The dish is gone from the menu: there is no current price to compare
      // against, but its past revenue at old prices is worth naming.
      removedDishes.push({
        menuItemId,
        name: entry.name || lines[0]?.unitPrice?.toString() || 'Unknown dish',
        qty: totalQty,
        revenueMinor: dishRevenue,
      });
      continue;
    }

    const drifting = lines.filter((line) => line.unitPrice !== menuItem.price);
    if (drifting.length === 0) {
      steadyDishCount += 1;
      continue;
    }

    const driftingQty = drifting.reduce((sum, l) => sum + l.qty, 0);
    const driftingRevenueMinor = drifting.reduce((sum, l) => sum + l.revenueMinor, 0);
    const driftingAtCurrentPriceMinor = driftingQty * menuItem.price;
    const dishDistortion = driftingAtCurrentPriceMinor - driftingRevenueMinor;

    driftingLineCount += drifting.length;
    distortionMinor += dishDistortion;

    dishes.push({
      menuItemId,
      name: menuItem.name || entry.name,
      category: menuItem.category,
      currentPrice: menuItem.price,
      totalQty,
      totalRevenueMinor: dishRevenue,
      driftingQty,
      driftingRevenueMinor,
      driftingAtCurrentPriceMinor,
      distortionMinor: dishDistortion,
      lines,
    });
  }

  // Worst distortion first — the dishes that move a revenue figure most.
  dishes.sort((a, b) => Math.abs(b.distortionMinor) - Math.abs(a.distortionMinor));
  removedDishes.sort((a, b) => b.revenueMinor - a.revenueMinor);

  return {
    dishes,
    steadyDishCount,
    removedDishes,
    driftingLineCount,
    driftingDishCount: dishes.length,
    totalRevenueMinor,
    distortionMinor,
  };
}

/** One paid ticket line behind a dish's revenue figure. */
export interface ItemTicketTrace {
  orderId: string;
  clientOrderId: string | null;
  createdAt: string | null;
  /** The price this dish was rung up at on that ticket. */
  unitPrice: number;
  qty: number;
  lineTotalMinor: number;
  /** What the ticket was billed in total. */
  billedTotalMinor: number;
  /** Σ(unitPrice × qty) over every line on the ticket. */
  linesTotalMinor: number;
  /**
   * True when the ticket's own lines do not add up to what it was billed — a
   * line priced 48,000 on a ticket that was charged 39,000 says the line price
   * is not what the shop actually charged.
   */
  billedMismatch: boolean;
}

/** Everything behind one dish's revenue figure, ticket by ticket. */
export interface ItemPriceTrace {
  query: string;
  menuItem: { id: string; name: string; price: number; category: string } | null;
  /** Every price paid tickets were rung up at, dearest first. */
  prices: PriceDriftLine[];
  tickets: ItemTicketTrace[];
  unitsSold: number;
  revenueMinor: number;
  /** What those units would bring in at the menu price trimmed today. */
  atMenuPriceMinor: number | null;
  mismatchedTicketCount: number;
  /** Paid tickets that carried the dish but were left out of the trace. */
  truncatedTickets: number;
}

/** Hard cap on the tickets a single trace prints. */
const TRACE_TICKET_LIMIT = 200;

/**
 * Follow one dish's revenue figure back to the tickets that produced it.
 *
 * The best-sellers card sums the price snapshotted on each order line, so
 * "13 sold = 624,000 ETB" is only possible when those lines were rung up at
 * 48,000 each. This trace prints exactly that: every paid ticket line for the
 * dish, the price per unit, the quantity, the ticket's billed total, and
 * whether the ticket's own lines even add up to what it was billed.
 */
export async function traceItemPrice(query: string): Promise<ItemPriceTrace> {
  const menuItems = await prisma.menuItem.findMany({
    select: { id: true, name: true, nameAmharic: true, price: true, category: true },
  });
  const wanted = nameKey(query);
  const menuItem =
    menuItems.find((item) => item.id === query) ??
    menuItems.find((item) => nameKey(item.name) === wanted || nameKey(item.nameAmharic) === wanted) ??
    null;

  // Snapshots are written at sale time, so a renamed dish can appear under its
  // old name too. Match every spelling this dish is known by.
  const names = [
    ...new Set(
      [query, menuItem?.name, menuItem?.nameAmharic]
        .map((n) => String(n ?? '').trim())
        .filter(Boolean),
    ),
  ];
  const keys = new Set(names.map(nameKey));

  const rawOrders = (await prisma.order.aggregateRaw({
    pipeline: [
      { $match: { status: 'PAID', 'items.name': { $in: names } } },
      { $sort: { createdAt: -1 } },
      { $limit: TRACE_TICKET_LIMIT + 1 },
      {
        $project: {
          _id: 1,
          clientOrderId: 1,
          createdAt: 1,
          totalAmount: 1,
          items: 1,
        },
      },
    ] as never,
  })) as unknown as Array<Record<string, unknown>>;

  const tickets: ItemTicketTrace[] = [];
  let unitsSold = 0;
  let revenueMinor = 0;
  const priceLines = new Map<number, PriceDriftLine>();
  let truncatedTickets = 0;

  for (const order of rawOrders ?? []) {
    const lines = Array.isArray(order.items) ? (order.items as Array<Record<string, unknown>>) : [];
    const matching = lines.filter((line) => keys.has(nameKey(line.name)));
    if (matching.length === 0) continue;
    if (tickets.length >= TRACE_TICKET_LIMIT) {
      truncatedTickets += 1;
      continue;
    }

    const linesTotalMinor = lines.reduce(
      (sum, line) => sum + unwrapNumber(line.unitPrice) * unwrapNumber(line.quantity),
      0,
    );
    const billedTotalMinor = unwrapNumber(order.totalAmount);
    const createdAt = unwrapDate(order.createdAt);

    for (const line of matching) {
      const unitPrice = unwrapNumber(line.unitPrice);
      const qty = unwrapNumber(line.quantity);
      const lineTotalMinor = unitPrice * qty;
      unitsSold += qty;
      revenueMinor += lineTotalMinor;

      const priceLine = priceLines.get(unitPrice) ?? { unitPrice, qty: 0, revenueMinor: 0, orders: 0 };
      priceLine.qty += qty;
      priceLine.revenueMinor += lineTotalMinor;
      priceLine.orders += 1;
      priceLines.set(unitPrice, priceLine);

      tickets.push({
        orderId: unwrapId(order._id),
        clientOrderId: order.clientOrderId ? String(order.clientOrderId) : null,
        createdAt,
        unitPrice,
        qty,
        lineTotalMinor,
        billedTotalMinor,
        linesTotalMinor,
        billedMismatch: linesTotalMinor !== billedTotalMinor,
      });
    }
  }

  const prices = [...priceLines.values()].sort((a, b) => b.unitPrice - a.unitPrice);

  return {
    query,
    menuItem: menuItem
      ? { id: menuItem.id, name: menuItem.name, price: menuItem.price, category: menuItem.category }
      : null,
    prices,
    tickets,
    unitsSold,
    revenueMinor,
    atMenuPriceMinor: menuItem ? unitsSold * menuItem.price : null,
    mismatchedTicketCount: new Set(
      tickets.filter((t) => t.billedMismatch).map((t) => t.orderId),
    ).size,
    truncatedTickets,
  };
}

/**
 * Why a price sits where it does against the menu price.
 *
 * A price that is exactly 100× the menu price is not a pricing decision: it is
 * the pre-`money-major-units` scale (the app used to store cents), and the
 * migration that divides money by 100 skipped anything it read as already
 * converted. Naming that in the report saves the reader the arithmetic — and
 * the hunt for a dish that was never on the menu at that price.
 */
export function priceNote(unitPrice: number, menuPrice: number | null | undefined): string {
  if (!menuPrice || menuPrice <= 0) return '';
  const ratio = unitPrice / menuPrice;
  const centsScale = Math.abs(unitPrice - menuPrice * 100) <= Math.max(1, menuPrice);
  return `  — ${ratio.toFixed(2)}× the menu price${centsScale ? ' (the old cents scale: 100×)' : ''}`;
}

/** Human-readable drill-down — what the audit script prints for `--item`. */
export function formatItemPriceTrace(trace: ItemPriceTrace): string {
  const money = (amount: number) => `${Math.round(amount).toLocaleString('en-US')} ETB`;
  const lines: string[] = [];

  const title = trace.menuItem?.name ?? trace.query;
  lines.push(`${title}`);
  lines.push(
    trace.menuItem
      ? `Menu price today: ${money(trace.menuItem.price)} (${trace.menuItem.category})`
      : 'Not on the menu any more — no current price to compare against.',
  );
  lines.push(
    `Paid history: ${trace.unitsSold} unit(s) for ${money(trace.revenueMinor)}` +
      (trace.menuItem && trace.unitsSold > 0
        ? ` — ${money(Math.round(trace.revenueMinor / trace.unitsSold))} per unit on average, ` +
          `against ${money(trace.menuItem.price)} on the menu.`
        : '.'),
  );
  if (trace.atMenuPriceMinor !== null) {
    lines.push(`At today's menu price those units would be ${money(trace.atMenuPriceMinor)}.`);
  }
  lines.push('');

  lines.push('Prices this dish was rung up at:');
  for (const price of trace.prices) {
    lines.push(
      `    ${money(price.unitPrice)} × ${price.qty} = ${money(price.revenueMinor)} ` +
        `across ${price.orders} line(s)${priceNote(price.unitPrice, trace.menuItem?.price)}`,
    );
  }
  lines.push('');

  lines.push(`Tickets (newest first${trace.truncatedTickets > 0 ? `, ${trace.truncatedTickets} more not shown` : ''}):`);
  for (const ticket of trace.tickets) {
    const when = ticket.createdAt ? ticket.createdAt.slice(0, 16).replace('T', ' ') : 'unknown date';
    const flag = ticket.billedMismatch
      ? `  ✗ lines add up to ${money(ticket.linesTotalMinor)} but the ticket was billed ${money(ticket.billedTotalMinor)}`
      : '';
    lines.push(
      `    ${when}  #${(ticket.clientOrderId || ticket.orderId).slice(-6)}  ` +
        `${money(ticket.unitPrice)} × ${ticket.qty} = ${money(ticket.lineTotalMinor)}` +
        `  (billed ${money(ticket.billedTotalMinor)})${flag}`,
    );
  }

  if (trace.mismatchedTicketCount > 0) {
    lines.push('');
    lines.push(
      `${trace.mismatchedTicketCount} ticket(s) do not bill what their own lines add up to — ` +
        'the line price is not what the shop charged, so the item revenue figure is built on it.',
    );
  }

  return lines.join('\n');
}

/** Human-readable report — the form the audit script prints. */
export function formatPriceDriftReport(report: PriceDriftReport): string {
  const money = (amount: number) => `${Math.round(amount).toLocaleString('en-US')} ETB`;
  const signed = (amount: number) => `${amount > 0 ? '+' : ''}${money(amount)}`;
  const lines: string[] = [];

  lines.push(
    `${report.driftingDishCount} dish(es) sold at a price that is not today's menu price, ` +
      `across ${report.driftingLineCount} price(s).`,
  );
  lines.push(`Paid revenue examined: ${money(report.totalRevenueMinor)}.`);
  lines.push(
    `Re-pricing those lines at today's menu prices moves the figure by ${signed(report.distortionMinor)}.`,
  );
  lines.push('');

  if (report.dishes.length === 0) {
    lines.push('No dish has a paid price that differs from its current menu price.');
  }

  for (const dish of report.dishes) {
    lines.push(
      `${dish.name}  (${dish.category}) — now ${dish.currentPrice} ETB · ` +
        `${dish.driftingQty} of ${dish.totalQty} units sold off-price · ` +
        `revenue ${signed(dish.distortionMinor)}`,
    );
    for (const line of dish.lines) {
      const marker = line.unitPrice === dish.currentPrice ? '  (current)' : '';
      lines.push(
        `    ${money(line.unitPrice)} × ${line.qty} = ${money(line.revenueMinor)}` +
          ` over ${line.orders} ticket(s)${marker}` +
          (marker ? '' : priceNote(line.unitPrice, dish.currentPrice)),
      );
    }
    lines.push('');
  }

  if (report.removedDishes.length > 0) {
    lines.push('No longer on the menu (cannot be re-priced):');
    for (const removed of report.removedDishes) {
      lines.push(`    ${removed.name} — ${removed.qty} units, ${money(removed.revenueMinor)}`);
    }
    lines.push('');
  }

  lines.push(`${report.steadyDishCount} dish(es) match their current menu price on every paid line.`);
  return lines.join('\n');
}
