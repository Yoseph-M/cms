import { prisma } from '../../services/prisma.service';
import { logger } from '../../utils/logger';

/**
 * One accountability stream.
 *
 * Staff activity (`AuditLog`) and account security (`LoginHistory`) live in two
 * collections but answer the same question — "who did what, when?" — so the
 * admin screens show them as a single, time-ordered feed. The merge happens
 * here, on the server, because a client cannot interleave two independent
 * cursors correctly: paging each collection separately would show August
 * activity above September logins. One cursor over both collections keeps the
 * order honest.
 */

export type FeedKind = 'ACTIVITY' | 'LOGIN';

export interface AuditFeedActor {
  id: string;
  name: string;
  role: string;
  /** Second line under the name: the role for activity, the username for logins. */
  subtitle: string;
}

export interface AuditFeedRow {
  id: string;
  kind: FeedKind;
  timestamp: string;
  action: string;
  entity: string;
  description: string;
  actor: AuditFeedActor | null;
  targetId: string | null;
  ip?: string | null;
  userAgent?: string | null;
  outcome?: string | null;
  /** Raw audit `details` blob for activities; rendered as JSON in the drawer. */
  payload?: Record<string, unknown> | null;
}

export interface AuditFeedPage {
  rows: AuditFeedRow[];
  nextCursor: string | null;
  total: number;
  facets: { actions: string[]; entities: string[] };
}

export interface AuditFeedQuery {
  search?: string;
  action?: string;
  entity?: string;
  order?: 'asc' | 'desc';
  cursor?: string;
  limit?: number;
}

/** Login rows are labelled by outcome; these names are what the feed displays. */
export const LOGIN_ACTION_BY_OUTCOME: Record<string, string> = {
  SUCCESS: 'LOGIN',
  FAILURE: 'LOGIN_FAILED',
  LOCKED: 'LOGIN_LOCKED',
};

const LOGIN_ACTIONS = Object.values(LOGIN_ACTION_BY_OUTCOME);

/**
 * Actions the app can record. Search walks this catalogue instead of the
 * database because the MongoDB connector has no case-insensitive `contains`,
 * and the list is small and stable enough to keep in code.
 */
export const KNOWN_ACTIONS: readonly string[] = [
  'ATTENDANCE_LOGGED',
  'ATTENDANCE_OVERRIDE',
  'ATTENDANCE_UPDATED',
  'BACKUP_DOWNLOADED',
  'BACKUP_RESTORED',
  'CANCELLATION_APPROVED',
  'CANCELLATION_REJECTED',
  'CANCELLATION_REQUESTED',
  'DAILY_CLOSE_COMPLETED',
  'DAILY_CLOSE_WITH_WARNINGS',
  'EXPENSE_CREATED',
  'EXPENSE_DELETED',
  'EXPENSE_UPDATED',
  'INTEGRITY_CHECK_FAILED',
  'INTEGRITY_ISSUE_RESOLVED',
  'MENU_AVAILABILITY_CHANGED',
  'MENU_ITEM_CREATED',
  'MENU_ITEM_DELETED',
  'MENU_ITEM_UPDATED',
  'ORDER_CANCELLED',
  'ORDER_CREATED',
  'ORDER_PAID',
  'ORDER_REPRINT',
  'ORDER_SETTLED',
  'PASSWORD_RESET',
  'PAYROLL_ADJUSTMENT',
  'PAYROLL_PROCESSED',
  'PAYROLL_RECORDED',
  'PRINT_AGENT_REGISTER',
  'PRINT_AGENT_REVOKE',
  'PRINT_JOB_RETRY',
  'PRINTER_CONFIG_UPDATE',
  'PRINTER_TEST',
  'PRINTER_UPDATE',
  'STATUS_TRANSITION',
  'USER_CREATED',
  'USER_DEACTIVATED',
  'USER_UPDATED',
  ...LOGIN_ACTIONS,
];

/** Entity types an audit row can target (plus `User` for login rows). */
export const KNOWN_ENTITIES: readonly string[] = [
  'Attendance',
  'DailyClose',
  'Expense',
  'IntegrityIssue',
  'MenuItem',
  'Order',
  'PayrollAdjustment',
  'PrintAgent',
  'PrintJob',
  'PrinterStation',
  'System',
  'User',
  'UserPayment',
];

/** Plain-language phrasing per action, used for the feed's Description column. */
const ACTION_PHRASES: Record<string, string> = {
  ATTENDANCE_LOGGED: 'Attendance logged',
  ATTENDANCE_OVERRIDE: 'Attendance overridden',
  ATTENDANCE_UPDATED: 'Attendance updated',
  BACKUP_DOWNLOADED: 'System backup downloaded',
  BACKUP_RESTORED: 'System data restored from a backup',
  CANCELLATION_APPROVED: 'Cancellation approved',
  CANCELLATION_REJECTED: 'Cancellation rejected',
  CANCELLATION_REQUESTED: 'Cancellation requested',
  DAILY_CLOSE_COMPLETED: 'End of day closed',
  DAILY_CLOSE_WITH_WARNINGS: 'End of day closed with warnings',
  EXPENSE_CREATED: 'Expense recorded',
  EXPENSE_DELETED: 'Expense deleted',
  EXPENSE_UPDATED: 'Expense updated',
  INTEGRITY_CHECK_FAILED: 'Integrity check found problems',
  INTEGRITY_ISSUE_RESOLVED: 'Integrity issue resolved',
  MENU_AVAILABILITY_CHANGED: 'Menu availability changed',
  MENU_ITEM_CREATED: 'Menu item added',
  MENU_ITEM_DELETED: 'Menu item deleted',
  MENU_ITEM_UPDATED: 'Menu item updated',
  ORDER_CANCELLED: 'Order cancelled',
  ORDER_CREATED: 'Order created',
  ORDER_PAID: 'Order paid',
  ORDER_REPRINT: 'Order reprinted',
  ORDER_SETTLED: 'Order settled',
  PASSWORD_RESET: 'Password reset',
  PAYROLL_ADJUSTMENT: 'Payroll adjustment',
  PAYROLL_PROCESSED: 'Payroll processed',
  PAYROLL_RECORDED: 'Payroll payment recorded',
  PRINT_AGENT_REGISTER: 'Print agent registered',
  PRINT_AGENT_REVOKE: 'Print agent revoked',
  PRINT_JOB_RETRY: 'Print job retried',
  PRINTER_CONFIG_UPDATE: 'Printer configuration updated',
  PRINTER_TEST: 'Test page printed',
  PRINTER_UPDATE: 'Printer updated',
  STATUS_TRANSITION: 'Order status changed',
  USER_CREATED: 'Staff account created',
  USER_DEACTIVATED: 'Staff account deactivated',
  USER_UPDATED: 'Staff account updated',
};

/** Detail keys worth appending to a description, in priority order. */
const HINT_KEYS = ['name', 'itemName', 'menuItem', 'station', 'reason', 'title', 'orderNumber', 'role', 'period', 'amount'];

const LOGIN_DESCRIPTIONS: Record<string, string> = {
  SUCCESS: 'User logged in',
  FAILURE: 'Failed login attempt',
  LOCKED: 'Account locked after failed attempts',
};

/** `PRINTER_TEST` → "Printer test" — the fallback when no phrase is registered. */
export function humanizeAction(actionType: string): string {
  const words = String(actionType || '').toLowerCase().split('_').filter(Boolean);
  if (!words.length) return 'System activity';
  const phrase = words.join(' ');
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

function hintFrom(details: unknown): string | null {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return null;
  const record = details as Record<string, unknown>;
  for (const key of HINT_KEYS) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 80);
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}

/**
 * "Order cancelled: customer left" reads better than a raw action name, and the
 * detail hint is what makes one `MENU_ITEM_UPDATED` distinguishable from the
 * next.
 */
export function describeActivity(actionType: string, details?: unknown): string {
  const phrase = ACTION_PHRASES[actionType] || humanizeAction(actionType);
  const hint = hintFrom(details);
  return hint ? `${phrase}: ${hint}` : phrase;
}

export function describeLogin(outcome: string, role?: string | null): string {
  const base = LOGIN_DESCRIPTIONS[outcome] || 'Login attempt';
  return outcome === 'SUCCESS' && role ? `${base} as ${role}` : base;
}

export function activityToRow(
  log: { id: string; timestamp: Date; actorId: string; actionType: string; targetType: string; targetId?: string | null; details?: unknown },
  actor?: { id: string; name: string; role: string; username?: string | null } | null,
): AuditFeedRow {
  return {
    id: log.id,
    kind: 'ACTIVITY',
    timestamp: new Date(log.timestamp).toISOString(),
    action: log.actionType,
    entity: log.targetType,
    description: describeActivity(log.actionType, log.details),
    actor: actor
      ? { id: actor.id, name: actor.name, role: actor.role, subtitle: actor.role }
      : null,
    targetId: log.targetId ?? null,
    payload: (log.details ?? null) as Record<string, unknown> | null,
  };
}

export function loginToRow(record: {
  id: string;
  createdAt: Date;
  userId: string;
  outcome: string;
  ip?: string | null;
  userAgent?: string | null;
  user?: { id: string; name: string; role: string; username?: string | null } | null;
}): AuditFeedRow {
  return {
    id: record.id,
    kind: 'LOGIN',
    timestamp: new Date(record.createdAt).toISOString(),
    action: LOGIN_ACTION_BY_OUTCOME[record.outcome] || 'LOGIN',
    entity: 'User',
    description: describeLogin(record.outcome, record.user?.role),
    actor: record.user
      ? {
          id: record.user.id,
          name: record.user.name,
          role: record.user.role,
          subtitle: record.user.username || record.user.role,
        }
      : null,
    targetId: record.userId,
    ip: record.ip ?? null,
    userAgent: record.userAgent ?? null,
    outcome: record.outcome,
  };
}

const rowTime = (row: AuditFeedRow) => Date.parse(row.timestamp);

/**
 * Merge two already-sorted pages into one sorted page.
 *
 * ObjectId strings are compared only to break timestamp ties, matching the
 * `[{timestamp}, {id}]` order the queries use — so the cursor can always resume
 * exactly where the merged page stopped.
 */
export function mergeFeedRows(a: AuditFeedRow[], b: AuditFeedRow[], order: 'asc' | 'desc'): AuditFeedRow[] {
  const sign = order === 'asc' ? 1 : -1;
  return [...a, ...b].sort((x, y) => {
    const diff = rowTime(x) - rowTime(y);
    if (diff !== 0) return diff * sign;
    return x.id.localeCompare(y.id) * sign;
  });
}

export function encodeFeedCursor(row: AuditFeedRow): string {
  return `${row.timestamp}|${row.id}`;
}

function decodeFeedCursor(cursor?: string): { date: Date; id: string } | null {
  if (!cursor) return null;
  const separator = cursor.lastIndexOf('|');
  if (separator === -1) return null;
  const date = new Date(cursor.slice(0, separator));
  const id = cursor.slice(separator + 1);
  if (Number.isNaN(date.getTime()) || !id) return null;
  return { date, id };
}

interface StreamFilters {
  auditWhere: Record<string, unknown>;
  loginWhere: Record<string, unknown>;
  matchesNothing: boolean;
}

/**
 * Turn the toolbar into per-collection filters.
 *
 * Search matches the action catalogue, the entity catalogue, staff names/roles
 * (account searches are a real question — "what did Yosef do?") and a pasted
 * record id.
 */
async function buildFilters(query: AuditFeedQuery): Promise<StreamFilters> {
  const auditWhere: Record<string, unknown> = {};
  const loginWhere: Record<string, unknown> = {};
  const auditAnd: Record<string, unknown>[] = [];
  const loginAnd: Record<string, unknown>[] = [];

  const action = query.action?.trim();
  if (action) {
    const outcome = Object.entries(LOGIN_ACTION_BY_OUTCOME).find(([, name]) => name === action)?.[0];
    auditWhere.actionType = action;
    // An activity action can never match a login row, and vice versa.
    loginWhere.outcome = outcome ?? { in: [] };
  }

  const entity = query.entity?.trim();
  if (entity) {
    auditWhere.targetType = entity;
    // Every login row is about a user account.
    if (entity !== 'User') loginWhere.userId = { in: [] };
  }

  const search = query.search?.trim();
  if (search) {
    const needle = search.toUpperCase();
    const [users] = await Promise.all([
      prisma.user.findMany({ select: { id: true, name: true, role: true, username: true } }),
    ]);
    const staffHits = users
      .filter((user) =>
        [user.name, user.username, user.role].some((field) => (field ?? '').toUpperCase().includes(needle)),
      )
      .map((user) => user.id);
    const actionHits = KNOWN_ACTIONS.filter((name) => name.includes(needle));
    const entityHits = KNOWN_ENTITIES.filter((name) => name.toUpperCase().includes(needle));

    const auditBranches: Record<string, unknown>[] = [];
    if (actionHits.length) auditBranches.push({ actionType: { in: actionHits } });
    if (entityHits.length) auditBranches.push({ targetType: { in: entityHits } });
    if (staffHits.length) auditBranches.push({ actorId: { in: staffHits } });
    // Pasting a record id from the details drawer should find its history.
    if (/^[a-f0-9]{24}$/i.test(search)) auditBranches.push({ targetId: search });

    const loginBranches: Record<string, unknown>[] = [];
    const outcomeHits = Object.entries(LOGIN_ACTION_BY_OUTCOME)
      .filter(([, name]) => name.includes(needle))
      .map(([outcome]) => outcome);
    if (outcomeHits.length) loginBranches.push({ outcome: { in: outcomeHits } });
    if (staffHits.length) loginBranches.push({ userId: { in: staffHits } });
    if (entityHits.includes('User')) loginBranches.push({});

    if (!auditBranches.length && !loginBranches.length) {
      return { auditWhere, loginWhere, matchesNothing: true };
    }
    // A stream with no matching branch must contribute nothing, not everything.
    auditAnd.push(...(auditBranches.length ? [{ OR: auditBranches }] : [{ id: { in: [] } }]));
    loginAnd.push(...(loginBranches.length ? [{ OR: loginBranches }] : [{ id: { in: [] } }]));
  }

  if (auditAnd.length) auditWhere.AND = auditAnd;
  if (loginAnd.length) loginWhere.AND = loginAnd;
  return { auditWhere, loginWhere, matchesNothing: false };
}

/**
 * Facets come from the whole collection, not the current filter — a dropdown
 * that empties itself while you are using it is worse than useless.
 */
async function readFacets(): Promise<{ actions: string[]; entities: string[] }> {
  try {
    const [auditActions, auditEntities, outcomes] = await Promise.all([
      prisma.auditLog.findMany({ distinct: ['actionType'], select: { actionType: true } }),
      prisma.auditLog.findMany({ distinct: ['targetType'], select: { targetType: true } }),
      prisma.loginHistory.findMany({ distinct: ['outcome'], select: { outcome: true } }),
    ]);
    const actions = new Set<string>([...KNOWN_ACTIONS]);
    auditActions.forEach((row) => actions.add(row.actionType));
    outcomes.forEach((row) => actions.add(LOGIN_ACTION_BY_OUTCOME[row.outcome] || row.outcome));
    const entities = new Set<string>([...KNOWN_ENTITIES]);
    auditEntities.forEach((row) => entities.add(row.targetType));
    return { actions: [...actions].sort(), entities: [...entities].sort() };
  } catch (err) {
    // A connector without `distinct` must not take the whole page down.
    logger.warn({ err }, 'Audit feed facets fell back to the static catalogue.');
    return { actions: [...KNOWN_ACTIONS].sort(), entities: [...KNOWN_ENTITIES].sort() };
  }
}

/**
 * Read one page of the unified feed. Used by the admin screen and by the CSV
 * export, so both always agree on ordering, filters and phrasing.
 */
export async function queryAuditFeed(query: AuditFeedQuery = {}): Promise<AuditFeedPage> {
  const order: 'asc' | 'desc' = query.order === 'asc' ? 'asc' : 'desc';
  const limit = Math.min(Math.max(Math.trunc(query.limit ?? 50) || 50, 1), 500);
  const { auditWhere, loginWhere, matchesNothing } = await buildFilters(query);

  if (matchesNothing) {
    return { rows: [], nextCursor: null, total: 0, facets: await readFacets() };
  }

  const cursor = decodeFeedCursor(query.cursor);
  if (cursor) {
    const auditAnd = (auditWhere.AND as Record<string, unknown>[]) ?? [];
    const loginAnd = (loginWhere.AND as Record<string, unknown>[]) ?? [];
    if (order === 'asc') {
      auditAnd.push({ OR: [{ timestamp: { gt: cursor.date } }, { timestamp: cursor.date, id: { gt: cursor.id } }] });
      loginAnd.push({ OR: [{ createdAt: { gt: cursor.date } }, { createdAt: cursor.date, id: { gt: cursor.id } }] });
    } else {
      auditAnd.push({ OR: [{ timestamp: { lt: cursor.date } }, { timestamp: cursor.date, id: { lt: cursor.id } }] });
      loginAnd.push({ OR: [{ createdAt: { lt: cursor.date } }, { createdAt: cursor.date, id: { lt: cursor.id } }] });
    }
    auditWhere.AND = auditAnd;
    loginWhere.AND = loginAnd;
  }

  const [rawLogs, rawLogins, auditTotal, loginTotal] = await Promise.all([
    prisma.auditLog.findMany({
      where: auditWhere,
      orderBy: [{ timestamp: order }, { id: order }],
      take: limit + 1,
    }),
    prisma.loginHistory.findMany({
      where: loginWhere,
      orderBy: [{ createdAt: order }, { id: order }],
      take: limit + 1,
      include: { user: { select: { id: true, name: true, role: true, username: true } } },
    }),
    prisma.auditLog.count({ where: auditWhere }),
    prisma.loginHistory.count({ where: loginWhere }),
  ]);

  // Legacy audit rows can outlive their actor account; a missing actor renders
  // as an unattributed row instead of dropping the event.
  const actorIds = [...new Set(rawLogs.map((log) => log.actorId))];
  const actors = actorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, name: true, role: true, username: true },
      })
    : [];
  const actorsById = new Map(actors.map((actor) => [actor.id, actor]));

  const merged = mergeFeedRows(
    rawLogs.map((log) => activityToRow(log, actorsById.get(log.actorId) ?? null)),
    rawLogins.map((record) => loginToRow(record)),
    order,
  );

  let nextCursor: string | null = null;
  if (merged.length > limit) {
    nextCursor = encodeFeedCursor(merged[limit - 1]);
    merged.length = limit;
  }

  return {
    rows: merged,
    nextCursor,
    total: auditTotal + loginTotal,
    facets: await readFacets(),
  };
}
