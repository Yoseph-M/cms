import { Router } from 'express';
import { ExpenseCategory, PaymentMethod, Role } from '@prisma/client';
import { requireAuth, type AuthenticatedRequest } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { prisma } from '../../services/prisma.service';

const router = Router();

router.use(requireAuth, requireRole([Role.OWNER, Role.MANAGER, Role.CASHIER]));

/**
 * Grouped global search behind the header search bar.
 *
 * Matching is deliberately "smart" without being magic:
 *  - Every whitespace-separated token must match somewhere (AND semantics),
 *    so "beef 25" finds menu items named beef at a 25-ish price point and
 *    "table 3 cancelled" narrows orders without any filter UI.
 *  - Matching ignores case and diacritics ("cafe" matches "Café").
 *  - Results are ranked: prefix matches before substring matches.
 *
 * Cashiers get menu + order hits (their whole job is on those), while staff,
 * money (expenses, payroll, settlements) and printer results stay with
 * Owner/Manager accounts.
 */

/** Lowercase + strip diacritics so "café" matches "cafe". */
const normalize = (value: string): string =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const i = (token: string) => ({ contains: token, mode: 'insensitive' as const });

/**
 * Match an enum field (role / category / status) against a token: exact match
 * after normalization, or a unique prefix ("canc" → CANCELLED). Empty when the
 * token can't plausibly be an enum value, so it's skipped in OR-branches.
 */
const enumMatches = (token: string, values: readonly string[]): string[] => {
  const t = normalize(token);
  const exact = values.find((v) => v.toLowerCase() === t);
  if (exact) return [exact];
  const prefixed = values.filter((v) => v.toLowerCase().startsWith(t));
  // Require the token to cover ≥3 chars of the value so "c" alone doesn't
  // fan out to every status.
  return prefixed.filter((v) => t.length >= 3 || v.toLowerCase() === t);
};

/**
 * Rank already-matching items: prefix hits on any field first, then earlier
 * fields, then everything else. Items whose tokens matched fields outside
 * `fields` are dropped (they only matched the wider DB query).
 */
function rankBy<T>(items: T[], tokens: string[], fields: Array<(item: T) => string>): T[] {
  return items
    .map((item) => {
      let score = 0;
      for (const token of tokens) {
        const idx = fields.findIndex((field) => normalize(field(item)).includes(token));
        if (idx === -1) return { item, score: -1 };
        const value = normalize(fields[idx](item));
        score += value.startsWith(token) ? 20 : 0;
        score += (fields.length - idx) / fields.length;
      }
      return { item, score };
    })
    .filter((s) => s.score >= 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.item);
}

/**
 * Words that describe the record type rather than its content: "table 3",
 * "order 12" should search for the value, not for the word itself.
 */
const FILLER_WORDS = new Set([
  'table', 'tables', 'ticket', 'tickets', 'order', 'orders',
  'bill', 'the', 'a', 'an', 'for', 'of',
]);

/** Tokens that look like a whole ETB amount (money is stored without cents). */
const amountTokens = (tokens: string[]): number[] =>
  tokens.filter((t) => /^\d+$/.test(t)).map(Number).filter((n) => n > 0);

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

/** Tokens naming a month ("aug", "august", "8") → 1–12. */
const monthTokens = (tokens: string[]): number[] => {
  const months: number[] = [];
  for (const token of tokens) {
    if (token.length >= 3) {
      const idx = MONTH_NAMES.findIndex((name) => name.startsWith(token.slice(0, 3)));
      if (idx >= 0) {
        months.push(idx + 1);
        continue;
      }
    }
    if (/^(0?[1-9]|1[0-2])$/.test(token)) months.push(Number(token));
  }
  return months;
};

/** Tokens naming a year ("2026"). */
const yearTokens = (tokens: string[]): number[] =>
  tokens.filter((t) => /^20\d{2}$/.test(t)).map(Number);

const EMPTY_RESULTS = {
  staff: [],
  menuItems: [],
  orders: [],
  expenses: [],
  payroll: [],
  settlements: [],
  printers: [],
};

router.get('/', async (req: AuthenticatedRequest, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const isCashier = req.user!.role === Role.CASHIER;
  if (q.length < 2) return res.json(EMPTY_RESULTS);

  // Cap token count so a pasted paragraph can't fan out into a huge query.
  const rawTokens = normalize(q).split(/\s+/).filter(Boolean).slice(0, 6);

  // Filler words carry no meaning of their own ("table 3", "order 12"), so they
  // are dropped when something else is left to match on. A query made only of
  // filler words keeps them, otherwise every record would match.
  const meaningful = rawTokens.filter((token) => !FILLER_WORDS.has(token));
  const tokens = meaningful.length > 0 ? meaningful : rawTokens;

  // ---------- staff (owner / manager only) ----------
  const staffPromise = isCashier
    ? Promise.resolve([])
    : prisma.user
        .findMany({
          where: {
            AND: tokens.map((token) => ({
              OR: [
                { name: i(token) },
                { username: i(token) },
                { phone: i(token) },
                ...enumMatches(token, Object.values(Role)).map((role) => ({ role: role as Role })),
              ],
            })),
          },
          select: { id: true, name: true, role: true, username: true, phone: true, isActive: true },
          take: 20,
        })
        .then((rows) =>
          rankBy(rows, tokens, [(u) => u.name, (u) => u.username ?? '', (u) => u.role, (u) => u.phone]).slice(0, 8),
        );

  // ---------- menu items ----------
  const menuPromise = prisma.menuItem
    .findMany({
      where: {
        AND: tokens.map((token) => ({
          OR: [
            { name: i(token) },
            ...enumMatches(token, ['FOOD', 'DRINK', 'DESSERT', 'OTHER']).map((category) => ({ category: category as never })),
          ],
        })),
      },
      select: { id: true, name: true, category: true, price: true, isAvailable: true },
      take: 24,
    })
    .then((rows) => rankBy(rows, tokens, [(m) => m.name, (m) => m.category]).slice(0, 8));

  // ---------- orders ----------
  const orderSelect = {
    id: true,
    clientOrderId: true,
    tableNumber: true,
    totalAmount: true,
    status: true,
    createdAt: true,
    items: true, // embedded OrderItem composite: name, quantity, unitPrice
  } as const;

  // 1. Straight matches on table number, ticket id or status ("cancelled").
  const byFieldPromise = prisma.order.findMany({
    where: {
      AND: tokens.map((token) => ({
        OR: [
          { tableNumber: i(token) },
          { clientOrderId: i(token) },
          ...enumMatches(token, ['SUBMITTED', 'IN_KITCHEN', 'SERVED', 'PAID', 'CANCELLED']).map(
            (status) => ({ status: status as never }),
          ),
        ],
      })),
    },
    select: orderSelect,
    orderBy: { createdAt: 'desc' },
    take: 24,
  });

  // 2. Orders placed by a matching waiter/staff member (ids resolved first so
  //    multi-token names like "anna a" work without needing all tokens in one
  //    order-level OR).
  const waiterPromise = isCashier
    ? Promise.resolve([] as Array<{ id: string }>)
    : prisma.user.findMany({
        where: { AND: tokens.map((token) => ({ name: i(token) })) },
        select: { id: true },
        take: 10,
      });

  // 3. Recent orders scanned for item-name hits ("latte"), which Prisma's
  //    embedded-list filters can't express portably on MongoDB.
  const recentPromise = prisma.order.findMany({
    select: orderSelect,
    orderBy: { createdAt: 'desc' },
    take: 150,
  });

  // ---------- expenses (owner / manager only) ----------
  const expensePromise = isCashier
    ? Promise.resolve([])
    : prisma.expense
        .findMany({
          where: {
            AND: tokens.map((token) => ({
              OR: [
                { description: i(token) },
                ...enumMatches(token, Object.values(ExpenseCategory)).map((category) => ({
                  category: category as never,
                })),
                ...amountTokens([token]).map((amount) => ({ amount })),
                { recordedBy: { name: i(token) } },
              ],
            })),
          },
          select: {
            id: true,
            category: true,
            amount: true,
            description: true,
            date: true,
            recordedBy: { select: { name: true } },
          },
          orderBy: { date: 'desc' },
          take: 24,
        })
        .then((rows) =>
          rankBy(rows, tokens, [
            (e) => e.description,
            (e) => e.category,
            (e) => String(e.amount),
            (e) => e.recordedBy?.name ?? '',
          ]).slice(0, 6),
        );

  // ---------- payroll (owner / manager only) ----------
  const months = monthTokens(tokens);
  const years = yearTokens(tokens);
  const payrollPromise = isCashier
    ? Promise.resolve([])
    : prisma.userPayment
        .findMany({
          where: {
            AND: tokens.map((token) => ({
              OR: [
                { user: { name: i(token) } },
                { note: i(token) },
                ...months.map((periodMonth) => ({ periodMonth })),
                ...years.map((periodYear) => ({ periodYear })),
                ...amountTokens([token]).map((paidAmount) => ({ paidAmount })),
              ],
            })),
          },
          select: {
            id: true,
            periodMonth: true,
            periodYear: true,
            paidAmount: true,
            note: true,
            user: { select: { name: true, role: true } },
          },
          orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
          take: 24,
        })
        .then((rows) =>
          rankBy(rows, tokens, [
            (p) => p.user?.name ?? '',
            (p) => `${
              MONTH_NAMES[(p.periodMonth ?? 1) - 1] ?? ''
            } ${p.periodYear}`,
            (p) => String(p.paidAmount),
            (p) => p.note,
          ]).slice(0, 6),
        );

  // ---------- settlements / money taken (owner / manager only) ----------
  const settlementPromise = isCashier
    ? Promise.resolve([])
    : prisma.settlement
        .findMany({
          where: {
            AND: tokens.map((token) => ({
              OR: [
                ...enumMatches(token, Object.values(PaymentMethod)).map((method) => ({
                  method: method as never,
                })),
                ...amountTokens([token]).map((amountMinor) => ({ amountMinor })),
                { reference: i(token) },
                { note: i(token) },
                {
                  order: {
                    OR: [{ tableNumber: i(token) }, { clientOrderId: i(token) }],
                  },
                },
              ],
            })),
          },
          select: {
            id: true,
            orderId: true,
            amountMinor: true,
            method: true,
            reference: true,
            note: true,
            createdAt: true,
            order: { select: { tableNumber: true, clientOrderId: true, status: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 24,
        })
        .then((rows) =>
          rankBy(rows, tokens, [
            (s) => s.order?.tableNumber ?? '',
            (s) => s.order?.clientOrderId ?? '',
            (s) => s.method,
            (s) => s.reference,
            (s) => String(s.amountMinor),
          ]).slice(0, 6),
        );

  // ---------- printers (owner / manager only) ----------
  const printerPromise = isCashier
    ? Promise.resolve([])
    : prisma.printerStation
        .findMany({
          where: {
            AND: tokens.map((token) => ({
              OR: [
                { station: i(token) },
                { ip: i(token) },
                { macAddress: i(token) },
                ...enumMatches(token, ['BLUETOOTH', 'USB', 'NETWORK']).map((transport) => ({
                  transport: transport as never,
                })),
              ],
            })),
          },
          select: { id: true, station: true, transport: true, ip: true, macAddress: true },
          take: 12,
        })
        .then((rows) =>
          rankBy(rows, tokens, [
            (p) => p.station,
            (p) => p.ip ?? '',
            (p) => p.macAddress ?? '',
            (p) => p.transport,
          ]).slice(0, 5),
        );

  const [staff, menuItems, byField, waiters, recent, expenses, payroll, settlements, printers] =
    await Promise.all([
      staffPromise,
      menuPromise,
      byFieldPromise,
      waiterPromise,
      recentPromise,
      expensePromise,
      payrollPromise,
      settlementPromise,
      printerPromise,
    ]);

  const waiterIds = waiters.map((w) => w.id);
  const byWaiter = waiterIds.length
    ? await prisma.order.findMany({
        where: { waiterId: { in: waiterIds } },
        select: orderSelect,
        orderBy: { createdAt: 'desc' },
        take: 12,
      })
    : [];

  // Item-name scan: every token must appear in the order's item names.
  const byItems = recent.filter((order) => {
    const names = normalize((order.items ?? []).map((it: { name?: string }) => it.name ?? '').join(' '));
    return tokens.every((token) => names.includes(token));
  });

  // Merge + dedupe, then rank on the human-meaningful fields.
  const orderById = new Map<string, (typeof recent)[number]>();
  for (const order of [...byField, ...byWaiter, ...byItems]) {
    if (!orderById.has(order.id)) orderById.set(order.id, order);
  }
  const orders = rankBy(
    [...orderById.values()],
    tokens,
    [(o) => o.tableNumber ?? '', (o) => o.clientOrderId ?? '', (o) => o.status, (o) => (o.items ?? []).map((it: { name?: string }) => it.name ?? '').join(' ')],
  ).slice(0, 8);

  return res.json({ staff, menuItems, orders, expenses, payroll, settlements, printers });
});

export default router;
