/**
 * Money-scale repair — finding and fixing tickets left in the old cents scale.
 *
 * Before the `money-major-units` migration the app stored money in cents: a
 * 1,200 ETB steak was stored as `120000`. The migration divided every money
 * field by 100, but it decided what to convert with a threshold heuristic
 * (`value >= 1000` means cents), and tickets that escaped it are still on the
 * old scale. Their prices read as 100× the menu — a 1,500 ETB dish shows up as
 * 150,000 on the best-sellers card — and because the ticket's own total is in
 * the same scale, every revenue figure that reads those tickets inherits it.
 *
 * This module repairs them, and only them:
 *
 *   • a ticket qualifies when it looks like the old scale on the evidence, not
 *     on a date cutoff — every line is a large value AND at least one line sits
 *     at least ten times above the price the menu holds today. A correct
 *     3,000 ETB line is 1× its menu price and is never touched.
 *   • the repair divides the order's line prices and its billed total, and any
 *     settlement recorded against it that is still a large value, by 100.
 *
 * `findMoneyScaleOrders` is read-only. `repairMoneyScaleOrders` writes, so the
 * script that calls it prints the full before/after list first and needs an
 * explicit `--apply`.
 *
 * Daily-close snapshots are deliberately left alone: they are immutable by
 * design after approval, and the closed-day reconciliation already flags a day
 * whose snapshot no longer matches the ledger.
 */

import { prisma } from './prisma.service';

/** The old scale is exactly 100× the major units used today. */
export const MONEY_SCALE_FACTOR = 100;

/**
 * Values below this were never cents in practice (10 ETB). It is the same floor
 * the original migration used, reused here so a ticket that was converted once
 * can never be converted again.
 */
export const MONEY_SCALE_FLOOR = 1000;

/**
 * How far above today's menu price a line has to sit before it cannot be a
 * pricing decision. Every cents-scale line found in production sits far above
 * it (33× or more); a corrected menu price never moves that far.
 */
export const MONEY_SCALE_MIN_RATIO = 10;

export interface MoneyScaleLine {
  /** The dish this line points at — carried through the rewrite untouched. */
  menuItemId: string;
  name: string;
  /** The price on the order line, as stored. */
  unitPrice: number;
  quantity: number;
  /** True when this line's price is the old scale and will be divided. */
  flagged: boolean;
  /** Same as `unitPrice` on a line that is already correct. */
  repairedUnitPrice: number;
  /** The menu price for the dish today, when the dish is still on the menu. */
  menuPrice: number | null;
  /** The line note, carried through the rewrite untouched. */
  notes: string;
}

export interface MoneyScaleSettlement {
  id: string;
  method: string;
  amountMinor: number;
  repairedAmountMinor: number;
  /**
   * How the payment follows the repair: it mirrors the ticket's new total when
   * it was the ticket's total, is divided when it is itself an old-scale value,
   * or is left untouched for a human to look at.
   */
  action: 'match-total' | 'scale' | 'leave';
}

export interface MoneyScaleCandidate {
  orderId: string;
  clientOrderId: string | null;
  createdAt: Date | null;
  status: string;
  /** The ticket's billed total, as stored (old scale). */
  totalAmount: number;
  /** What the ticket's total becomes after the repair. */
  repairedTotalAmount: number;
  lines: MoneyScaleLine[];
  /** Σ(unitPrice × quantity) over the ticket's lines, as stored. */
  linesTotal: number;
  settlements: MoneyScaleSettlement[];
  /** One line naming the evidence for a reviewer. */
  reason: string;
}

export interface MoneyScaleRepairResult {
  /** Candidates examined. */
  inspected: number;
  /** Tickets actually rewritten (all of them, unless `ids` narrowed it). */
  repaired: number;
  orders: Array<{ orderId: string; clientOrderId: string | null; totalAmount: number }>;
  settlementsRepaired: number;
}

interface RawOrderRow {
  _id?: unknown;
  clientOrderId?: unknown;
  createdAt?: unknown;
  status?: unknown;
  totalAmount?: unknown;
  items?: unknown;
}

function unwrapId(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if ('$oid' in o) return String(o.$oid);
  }
  return String(value);
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

function asDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (value !== null && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (o.$date instanceof Date) return o.$date;
    if (typeof o.$date === 'string') {
      const d = new Date(o.$date);
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }
  return null;
}

/** Name key that ignores case, a bilingual tail and extra spacing. */
function nameKey(name: unknown): string {
  return String(name ?? '')
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const repaired = (value: number) => Math.round(value / MONEY_SCALE_FACTOR);

/**
 * Every ticket that still reads in the old cents scale.
 *
 * Read-only. The scan is narrowed in Mongo to orders holding at least one line
 * of 10,000 or more, so a shop with a long history does not pull its whole
 * order book into memory.
 */
export async function findMoneyScaleOrders(): Promise<MoneyScaleCandidate[]> {
  const menuItems = await prisma.menuItem.findMany({ select: { name: true, price: true } });
  const menuPriceByName = new Map<string, number>();
  const menuPriceByKey = new Map<string, number>();
  for (const item of menuItems) {
    menuPriceByName.set(String(item.name ?? ''), item.price);
    const key = nameKey(item.name);
    if (key && !menuPriceByKey.has(key)) menuPriceByKey.set(key, item.price);
  }

  const raw = (await prisma.order.aggregateRaw({
    pipeline: [
      { $match: { 'items.unitPrice': { $gte: MONEY_SCALE_MIN_RATIO * MONEY_SCALE_FLOOR } } },
      {
        $project: {
          _id: 1,
          clientOrderId: 1,
          createdAt: 1,
          status: 1,
          totalAmount: 1,
          items: 1,
        },
      },
    ] as never,
  })) as unknown as RawOrderRow[];

  const candidates: MoneyScaleCandidate[] = [];

  for (const row of raw ?? []) {
    const orderId = unwrapId(row._id);
    if (!orderId) continue;

    const rawLines = Array.isArray(row.items) ? (row.items as Array<Record<string, unknown>>) : [];
    if (rawLines.length === 0) continue;

    /**
     * The scale is decided per LINE, not per ticket: a ticket rung up while the
     * migration was half-applied holds both (Burger 2,000 already correct,
     * Black Tea 10,000 still cents). A line is on the old scale only when it is
     * a large value that also sits far above today's menu price — so a line
     * that already equals the menu price is left exactly as it is.
     */
    const lines: MoneyScaleLine[] = rawLines.map((line) => {
      const name = String(line.name ?? '');
      const menuPrice = menuPriceByName.get(name) ?? menuPriceByKey.get(nameKey(name)) ?? null;
      const unitPrice = unwrapNumber(line.unitPrice);
      const flagged =
        Math.abs(unitPrice) >= MONEY_SCALE_FLOOR &&
        menuPrice !== null &&
        menuPrice > 0 &&
        unitPrice >= menuPrice * MONEY_SCALE_MIN_RATIO;
      return {
        menuItemId: unwrapId(line.menuItemId),
        name,
        unitPrice,
        quantity: unwrapNumber(line.quantity),
        flagged,
        repairedUnitPrice: flagged ? repaired(unitPrice) : unitPrice,
        menuPrice,
        notes: String(line.notes ?? ''),
      };
    });

    const linesTotal = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);

    if (!lines.some((line) => line.flagged)) continue;

    // The ticket's own money is corrected by what its lines lose, never by a
    // blind ÷100: on a mixed ticket that keeps the bill equal to its lines.
    const lineDelta = lines.reduce(
      (sum, line) => sum + (line.unitPrice - line.repairedUnitPrice) * line.quantity,
      0,
    );
    const totalAmount = unwrapNumber(row.totalAmount);
    const repairedTotalAmount = totalAmount - lineDelta;

    // A total that would go to zero or below means the ticket does not hold
    // together; leave it for a human rather than write a nonsense bill.
    if (repairedTotalAmount <= 0) continue;

    const settlements = await prisma.settlement.findMany({
      where: { orderId },
      select: { id: true, method: true, amountMinor: true },
    });

    const worst = lines.filter((line) => line.flagged).reduce<MoneyScaleLine | null>((top, line) => {
      if (line.menuPrice === null || line.menuPrice <= 0) return top;
      const ratio = line.unitPrice / line.menuPrice;
      if (!top || !top.menuPrice) return line;
      return ratio > top.unitPrice / top.menuPrice ? line : top;
    }, null);

    candidates.push({
      orderId,
      clientOrderId: row.clientOrderId ? String(row.clientOrderId) : null,
      createdAt: asDate(row.createdAt),
      status: String(row.status ?? ''),
      totalAmount,
      repairedTotalAmount,
      lines,
      linesTotal,
      settlements: settlements.map((s) => {
        // A payment that was the ticket's total follows the ticket; one that is
        // itself an old-scale value is divided; anything else is left alone and
        // printed for review.
        if (s.amountMinor === totalAmount) {
          return {
            id: s.id,
            method: s.method,
            amountMinor: s.amountMinor,
            repairedAmountMinor: repairedTotalAmount,
            action: 'match-total' as const,
          };
        }
        if (Math.abs(s.amountMinor) >= MONEY_SCALE_FLOOR && s.amountMinor >= repairedTotalAmount * MONEY_SCALE_MIN_RATIO) {
          return {
            id: s.id,
            method: s.method,
            amountMinor: s.amountMinor,
            repairedAmountMinor: repaired(s.amountMinor),
            action: 'scale' as const,
          };
        }
        return {
          id: s.id,
          method: s.method,
          amountMinor: s.amountMinor,
          repairedAmountMinor: s.amountMinor,
          action: 'leave' as const,
        };
      }),
      reason: worst && worst.menuPrice
        ? `${worst.name}: ${worst.unitPrice.toLocaleString('en-US')} is ` +
          `${(worst.unitPrice / worst.menuPrice).toFixed(0)}× today's menu price of ` +
          `${worst.menuPrice.toLocaleString('en-US')}`
        : 'a line is a large value while the ticket total is on the old scale',
    });
  }

  candidates.sort(
    (a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0),
  );
  return candidates;
}

/**
 * Rewrite the given tickets (or every candidate when `ids` is omitted): the
 * flagged lines are divided by 100, the billed total loses exactly what those
 * lines lost, and each payment follows the ticket (or is divided when it is an
 * old-scale value itself).
 *
 * Returns what it changed so the caller can print it. This is the only function
 * in the module that writes.
 */
export async function repairMoneyScaleOrders(ids?: string[]): Promise<MoneyScaleRepairResult> {
  const candidates = await findMoneyScaleOrders();
  const targets = ids ? candidates.filter((c) => ids.includes(c.orderId)) : candidates;

  const result: MoneyScaleRepairResult = {
    inspected: candidates.length,
    repaired: 0,
    orders: [],
    settlementsRepaired: 0,
  };

  for (const candidate of targets) {
    // The embedded items array is rewritten whole: Prisma replaces the list,
    // and only the flagged lines change value.
    const items = candidate.lines.map((line) => ({
      menuItemId: line.menuItemId,
      name: line.name,
      quantity: line.quantity,
      unitPrice: line.repairedUnitPrice,
      notes: line.notes,
    }));

    await prisma.order.update({
      where: { id: candidate.orderId },
      data: { items, totalAmount: candidate.repairedTotalAmount },
    });

    for (const settlement of candidate.settlements) {
      if (settlement.action === 'leave' || settlement.repairedAmountMinor === settlement.amountMinor) continue;
      await prisma.settlement.update({
        where: { id: settlement.id },
        data: { amountMinor: settlement.repairedAmountMinor },
      });
      result.settlementsRepaired += 1;
    }

    result.repaired += 1;
    result.orders.push({
      orderId: candidate.orderId,
      clientOrderId: candidate.clientOrderId,
      totalAmount: candidate.repairedTotalAmount,
    });
  }

  return result;
}

/** Human-readable dry run — the form the repair script prints. */
export function formatMoneyScaleCandidates(candidates: MoneyScaleCandidate[]): string {
  const money = (amount: number) => `${Math.round(amount).toLocaleString('en-US')} ETB`;
  const lines: string[] = [];

  const ordersTotal = candidates.reduce((sum, c) => sum + c.totalAmount, 0);
  const repairedTotal = candidates.reduce((sum, c) => sum + c.repairedTotalAmount, 0);
  lines.push(
    `${candidates.length} ticket(s) hold prices in the old cents scale — billed ` +
      `${money(ordersTotal)} between them, which becomes ${money(repairedTotal)}.`,
  );
  lines.push('');

  for (const candidate of candidates) {
    const when = candidate.createdAt
      ? candidate.createdAt.toISOString().slice(0, 16).replace('T', ' ')
      : 'unknown date';
    lines.push(
      `#${(candidate.clientOrderId || candidate.orderId).slice(-6)}  ${when}  ${candidate.status}  ` +
        `billed ${money(candidate.totalAmount)} → ${money(candidate.repairedTotalAmount)}`,
    );
    lines.push(`    why: ${candidate.reason}`);
    for (const line of candidate.lines) {
      const menuNote = line.menuPrice !== null ? `   (menu ${money(line.menuPrice)})` : '';
      lines.push(
        line.flagged
          ? `    ${line.name}  ${money(line.unitPrice)} → ${money(line.repairedUnitPrice)} × ${line.quantity}${menuNote}`
          : `    ${line.name}  ${money(line.unitPrice)} × ${line.quantity}   (already correct, left as it is)`,
      );
    }
    for (const settlement of candidate.settlements) {
      const note =
        settlement.action === 'leave' && settlement.repairedAmountMinor === settlement.amountMinor
          ? '   (already correct)'
          : settlement.action === 'leave'
            ? '   (left for review)'
            : '';
      lines.push(
        `    payment ${settlement.method}  ${money(settlement.amountMinor)} → ` +
          `${money(settlement.repairedAmountMinor)}${note}`,
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}
