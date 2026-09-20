import { prisma } from '../../services/prisma.service';
import { logger } from '../../utils/logger';
import { queryAuditFeed, type AuditFeedRow } from '../audit/auditFeed';

/**
 * Backup & restore for a self-hosted POS.
 *
 * Two shapes are offered, for two different jobs:
 *
 *  - a **JSON snapshot** of every business collection, for "put this box back
 *    the way it was" (disaster recovery, moving to new hardware), and
 *  - **CSV exports** per dataset, for accountants and spreadsheets.
 *
 * Secrets never leave the server: password hashes, print-agent token hashes and
 * refresh tokens are stripped from the snapshot, so a backup file can be handed
 * to a manager or stored in a shared drive without becoming a credential leak.
 */

export interface CsvColumn {
  header: string;
  value: (row: any) => unknown;
}

export interface DatasetDefinition {
  key: string;
  label: string;
  description: string;
  columns: CsvColumn[];
  /** Newest first; `limit` is a safety valve, not a page size. */
  list: (limit: number) => Promise<any[]>;
  count: () => Promise<number>;
}

const iso = (value: unknown): string => {
  if (!value) return '';
  const date = new Date(value as string);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
};

const day = (value: unknown): string => {
  const full = iso(value);
  return full ? full.slice(0, 10) : '';
};

/** Guarded count so one failing collection can't blank the whole page. */
async function safeCount(run: () => Promise<number>): Promise<number> {
  try {
    return await run();
  } catch (err) {
    logger.warn({ err }, 'Backup dataset count failed.');
    return 0;
  }
}

/** The unified accountability stream, the same rows the admin screen shows. */
async function fetchAuditFeedRows(limit: number): Promise<AuditFeedRow[]> {
  const rows: AuditFeedRow[] = [];
  let cursor: string | undefined;
  do {
    const page = await queryAuditFeed({ limit: Math.min(200, limit - rows.length), cursor });
    rows.push(...page.rows);
    cursor = page.nextCursor ?? undefined;
  } while (cursor && rows.length < limit);
  return rows.slice(0, limit);
}

export const DATASETS: readonly DatasetDefinition[] = [
  {
    key: 'orders',
    label: 'Sales Orders',
    description: 'Every order with its table, status, staff and total.',
    count: () => safeCount(() => prisma.order.count()),
    list: (limit) =>
      prisma.order.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: { waiter: { select: { name: true } }, cashier: { select: { name: true } } },
      }),
    columns: [
      { header: 'Order ID', value: (r) => r.id },
      { header: 'Created', value: (r) => iso(r.createdAt) },
      { header: 'Table', value: (r) => r.tableNumber },
      { header: 'Status', value: (r) => r.status },
      { header: 'Settlement', value: (r) => r.settlementStatus },
      { header: 'Waiter', value: (r) => r.waiter?.name ?? '' },
      { header: 'Cashier', value: (r) => r.cashier?.name ?? '' },
      { header: 'Items', value: (r) => (r.items ?? []).map((i: any) => `${i.quantity}x ${i.name}`).join(' | ') },
      { header: 'Total (ETB)', value: (r) => r.totalAmount },
    ],
  },
  {
    key: 'payments',
    label: 'Payments',
    description: 'Settlements recorded against orders.',
    count: () => safeCount(() => prisma.settlement.count()),
    list: (limit) =>
      prisma.settlement.findMany({
        orderBy: { recordedAt: 'desc' },
        take: limit,
        include: { recordedBy: { select: { name: true } } },
      }),
    columns: [
      { header: 'Payment ID', value: (r) => r.id },
      { header: 'Recorded', value: (r) => iso(r.recordedAt) },
      { header: 'Order ID', value: (r) => r.orderId },
      { header: 'Method', value: (r) => r.method },
      { header: 'Amount (ETB)', value: (r) => r.amountMinor },
      { header: 'Reference', value: (r) => r.reference },
      { header: 'Note', value: (r) => r.note },
      { header: 'Recorded by', value: (r) => r.recordedBy?.name ?? '' },
    ],
  },
  {
    key: 'expenses',
    label: 'Expenses',
    description: 'Operating costs recorded outside payroll.',
    count: () => safeCount(() => prisma.expense.count()),
    list: (limit) =>
      prisma.expense.findMany({
        orderBy: { date: 'desc' },
        take: limit,
        include: { recordedBy: { select: { name: true } } },
      }),
    columns: [
      { header: 'Expense ID', value: (r) => r.id },
      { header: 'Date', value: (r) => day(r.date) },
      { header: 'Category', value: (r) => r.category },
      { header: 'Description', value: (r) => r.description },
      { header: 'Amount (ETB)', value: (r) => r.amount },
      { header: 'Recorded by', value: (r) => r.recordedBy?.name ?? '' },
    ],
  },
  {
    key: 'payroll',
    label: 'Payroll',
    description: 'Salary payments per staff member and period.',
    count: () => safeCount(() => prisma.userPayment.count()),
    list: (limit) =>
      prisma.userPayment.findMany({
        orderBy: { paymentDate: 'desc' },
        take: limit,
        include: { user: { select: { name: true, role: true } }, processedBy: { select: { name: true } } },
      }),
    columns: [
      { header: 'Payment ID', value: (r) => r.id },
      { header: 'Period', value: (r) => `${r.periodYear}-${String(r.periodMonth).padStart(2, '0')}` },
      { header: 'Staff', value: (r) => r.user?.name ?? '' },
      { header: 'Role', value: (r) => r.user?.role ?? '' },
      { header: 'Base salary (ETB)', value: (r) => r.baseSalary },
      { header: 'Paid (ETB)', value: (r) => r.paidAmount },
      { header: 'Note', value: (r) => r.note },
      { header: 'Payment date', value: (r) => day(r.paymentDate) },
      { header: 'Processed by', value: (r) => r.processedBy?.name ?? '' },
    ],
  },
  {
    key: 'attendance',
    label: 'Attendance',
    description: 'Daily presence records per staff member.',
    count: () => safeCount(() => prisma.attendance.count()),
    list: (limit) =>
      prisma.attendance.findMany({
        orderBy: [{ date: 'desc' }],
        take: limit,
        include: { user: { select: { name: true, role: true } } },
      }),
    columns: [
      { header: 'Record ID', value: (r) => r.id },
      { header: 'Date', value: (r) => r.date },
      { header: 'Staff', value: (r) => r.user?.name ?? '' },
      { header: 'Role', value: (r) => r.user?.role ?? '' },
      { header: 'Status', value: (r) => r.status },
      { header: 'Source', value: (r) => r.source },
      { header: 'Note', value: (r) => r.note },
    ],
  },
  {
    key: 'menu',
    label: 'Menu Items',
    description: 'The catalogue with prices and availability.',
    count: () => safeCount(() => prisma.menuItem.count()),
    list: (limit) => prisma.menuItem.findMany({ orderBy: [{ category: 'asc' }, { name: 'asc' }], take: limit }),
    columns: [
      { header: 'Item ID', value: (r) => r.id },
      { header: 'Name', value: (r) => r.name },
      { header: 'Name (Amharic)', value: (r) => r.nameAmharic ?? '' },
      { header: 'Category', value: (r) => r.category },
      { header: 'Price (ETB)', value: (r) => r.price },
      { header: 'Available', value: (r) => (r.isAvailable ? 'yes' : 'no') },
    ],
  },
  {
    key: 'staff',
    label: 'Staff',
    description: 'Accounts, roles and salary references. No passwords.',
    count: () => safeCount(() => prisma.user.count()),
    list: (limit) =>
      prisma.user.findMany({
        orderBy: { createdAt: 'asc' },
        take: limit,
        select: {
          id: true,
          name: true,
          role: true,
          username: true,
          phone: true,
          salaryAmount: true,
          isActive: true,
          createdAt: true,
        },
      }),
    columns: [
      { header: 'Staff ID', value: (r) => r.id },
      { header: 'Name', value: (r) => r.name },
      { header: 'Role', value: (r) => r.role },
      { header: 'Username', value: (r) => r.username ?? '' },
      { header: 'Phone', value: (r) => r.phone },
      { header: 'Salary (ETB)', value: (r) => r.salaryAmount },
      { header: 'Active', value: (r) => (r.isActive ? 'yes' : 'no') },
      { header: 'Created', value: (r) => iso(r.createdAt) },
    ],
  },
  {
    key: 'audit',
    label: 'Audit Logs',
    description: 'Staff activity and login history in one timeline.',
    count: () =>
      safeCount(async () => (await prisma.auditLog.count()) + (await prisma.loginHistory.count())),
    list: (limit) => fetchAuditFeedRows(limit),
    columns: [
      { header: 'Timestamp', value: (r: AuditFeedRow) => r.timestamp },
      { header: 'Kind', value: (r: AuditFeedRow) => (r.kind === 'LOGIN' ? 'Login' : 'Activity') },
      { header: 'User', value: (r: AuditFeedRow) => r.actor?.name ?? '' },
      { header: 'Role', value: (r: AuditFeedRow) => r.actor?.role ?? '' },
      { header: 'Action', value: (r: AuditFeedRow) => r.action },
      { header: 'Entity', value: (r: AuditFeedRow) => r.entity },
      { header: 'Description', value: (r: AuditFeedRow) => r.description },
      { header: 'Target ID', value: (r: AuditFeedRow) => r.targetId ?? '' },
      { header: 'IP', value: (r: AuditFeedRow) => r.ip ?? '' },
      { header: 'Outcome', value: (r: AuditFeedRow) => r.outcome ?? '' },
      { header: 'Details', value: (r: AuditFeedRow) => (r.payload ? JSON.stringify(r.payload) : '') },
    ],
  },
];

export function findDataset(key: string): DatasetDefinition | undefined {
  return DATASETS.find((dataset) => dataset.key === key);
}

export async function datasetSummaries() {
  return Promise.all(
    DATASETS.map(async (dataset) => ({
      key: dataset.key,
      label: dataset.label,
      description: dataset.description,
      rows: await dataset.count(),
    })),
  );
}

/** RFC 4180 quoting — a comma, quote or newline in a note must survive Excel. */
function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(columns: CsvColumn[], rows: any[]): string {
  const lines = [columns.map((column) => escapeCsv(column.header)).join(',')];
  for (const row of rows) {
    lines.push(columns.map((column) => escapeCsv(column.value(row))).join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}

// ---------------------------------------------------------------------------
// JSON snapshot
// ---------------------------------------------------------------------------

interface SnapshotCollection {
  key: string;
  label: string;
  list: () => Promise<any[]>;
  /** Fields that are never written to the file (credentials, tokens). */
  omit?: string[];
  existingIds: (ids: string[]) => Promise<string[]>;
  insert: (rows: any[]) => Promise<{ count: number }>;
}

const without = (row: Record<string, unknown>, omit?: string[]) => {
  if (!omit?.length) return row;
  const copy = { ...row };
  omit.forEach((field) => delete copy[field]);
  return copy;
};

const SNAPSHOT_COLLECTIONS: readonly SnapshotCollection[] = [
  {
    key: 'users',
    label: 'Staff accounts',
    omit: ['passwordHash'],
    list: () => prisma.user.findMany({ orderBy: { createdAt: 'asc' } }),
    existingIds: async (ids) =>
      (await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((r) => r.id),
    insert: (rows) => prisma.user.createMany({ data: rows as any }),
  },
  {
    key: 'menuItems',
    label: 'Menu items',
    list: () => prisma.menuItem.findMany(),
    existingIds: async (ids) =>
      (await prisma.menuItem.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((r) => r.id),
    insert: (rows) => prisma.menuItem.createMany({ data: rows as any }),
  },
  {
    key: 'orders',
    label: 'Orders',
    list: () => prisma.order.findMany({ orderBy: { createdAt: 'asc' } }),
    existingIds: async (ids) =>
      (await prisma.order.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((r) => r.id),
    insert: (rows) => prisma.order.createMany({ data: rows as any }),
  },
  {
    key: 'settlements',
    label: 'Payments',
    list: () => prisma.settlement.findMany(),
    existingIds: async (ids) =>
      (await prisma.settlement.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((r) => r.id),
    insert: (rows) => prisma.settlement.createMany({ data: rows as any }),
  },
  {
    key: 'expenses',
    label: 'Expenses',
    list: () => prisma.expense.findMany(),
    existingIds: async (ids) =>
      (await prisma.expense.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((r) => r.id),
    insert: (rows) => prisma.expense.createMany({ data: rows as any }),
  },
  {
    key: 'userPayments',
    label: 'Payroll payments',
    list: () => prisma.userPayment.findMany(),
    existingIds: async (ids) =>
      (await prisma.userPayment.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((r) => r.id),
    insert: (rows) => prisma.userPayment.createMany({ data: rows as any }),
  },
  {
    key: 'payrollAdjustments',
    label: 'Payroll adjustments',
    list: () => prisma.payrollAdjustment.findMany(),
    existingIds: async (ids) =>
      (await prisma.payrollAdjustment.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((r) => r.id),
    insert: (rows) => prisma.payrollAdjustment.createMany({ data: rows as any }),
  },
  {
    key: 'attendance',
    label: 'Attendance',
    list: () => prisma.attendance.findMany(),
    existingIds: async (ids) =>
      (await prisma.attendance.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((r) => r.id),
    insert: (rows) => prisma.attendance.createMany({ data: rows as any }),
  },
  {
    key: 'cancellationRequests',
    label: 'Cancellation requests',
    list: () => prisma.orderCancellationRequest.findMany(),
    existingIds: async (ids) =>
      (await prisma.orderCancellationRequest.findMany({ where: { id: { in: ids } }, select: { id: true } })).map(
        (r) => r.id,
      ),
    insert: (rows) => prisma.orderCancellationRequest.createMany({ data: rows as any }),
  },
  {
    key: 'dailyCloses',
    label: 'End-of-day closes',
    list: () => prisma.dailyClose.findMany(),
    existingIds: async (ids) =>
      (await prisma.dailyClose.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((r) => r.id),
    insert: (rows) => prisma.dailyClose.createMany({ data: rows as any }),
  },
  {
    key: 'integrityIssues',
    label: 'Integrity issues',
    list: () => prisma.integrityIssue.findMany(),
    existingIds: async (ids) =>
      (await prisma.integrityIssue.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((r) => r.id),
    insert: (rows) => prisma.integrityIssue.createMany({ data: rows as any }),
  },
  {
    key: 'systemSettings',
    label: 'System settings',
    list: () => prisma.systemSetting.findMany(),
    existingIds: async (ids) =>
      (await prisma.systemSetting.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((r) => r.id),
    insert: (rows) => prisma.systemSetting.createMany({ data: rows as any }),
  },
  {
    key: 'printerStations',
    label: 'Printers',
    list: () => prisma.printerStation.findMany(),
    existingIds: async (ids) =>
      (await prisma.printerStation.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((r) => r.id),
    insert: (rows) => prisma.printerStation.createMany({ data: rows as any }),
  },
  {
    key: 'printAgents',
    label: 'Print agents',
    omit: ['tokenHash'],
    list: () => prisma.printAgent.findMany(),
    existingIds: async (ids) =>
      (await prisma.printAgent.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((r) => r.id),
    insert: (rows) => prisma.printAgent.createMany({ data: rows as any }),
  },
  {
    key: 'printJobs',
    label: 'Print jobs',
    list: () => prisma.printJob.findMany(),
    existingIds: async (ids) =>
      (await prisma.printJob.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((r) => r.id),
    insert: (rows) => prisma.printJob.createMany({ data: rows as any }),
  },
  {
    key: 'notifications',
    label: 'Notifications',
    list: () => prisma.notification.findMany(),
    existingIds: async (ids) =>
      (await prisma.notification.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((r) => r.id),
    insert: (rows) => prisma.notification.createMany({ data: rows as any }),
  },
  {
    key: 'auditLogs',
    label: 'Audit logs',
    list: () => prisma.auditLog.findMany({ orderBy: { timestamp: 'asc' } }),
    existingIds: async (ids) =>
      (await prisma.auditLog.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((r) => r.id),
    insert: (rows) => prisma.auditLog.createMany({ data: rows as any }),
  },
  {
    key: 'loginHistory',
    label: 'Login history',
    list: () => prisma.loginHistory.findMany({ orderBy: { createdAt: 'asc' } }),
    existingIds: async (ids) =>
      (await prisma.loginHistory.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((r) => r.id),
    insert: (rows) => prisma.loginHistory.createMany({ data: rows as any }),
  },
];

export interface Snapshot {
  format: 'mern-pos-backup';
  version: number;
  generatedAt: string;
  counts: Record<string, number>;
  data: Record<string, unknown[]>;
}

export const SNAPSHOT_FORMAT = 'mern-pos-backup';
export const SNAPSHOT_VERSION = 1;

export async function buildSnapshot(): Promise<Snapshot> {
  const data: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};

  for (const collection of SNAPSHOT_COLLECTIONS) {
    try {
      const rows = await collection.list();
      data[collection.key] = rows.map((row) => without(row, collection.omit));
      counts[collection.key] = rows.length;
    } catch (err) {
      // One unreadable collection must not cost the operator the whole backup;
      // the missing section is reported in `counts` as -1.
      logger.error({ err, collection: collection.key }, 'Snapshot collection failed.');
      data[collection.key] = [];
      counts[collection.key] = -1;
    }
  }

  return {
    format: SNAPSHOT_FORMAT,
    version: SNAPSHOT_VERSION,
    generatedAt: new Date().toISOString(),
    counts,
    data,
  };
}

export interface RestoreCollectionResult {
  key: string;
  label: string;
  inserted: number;
  skipped: number;
  failed: number;
  error?: string;
}

export interface RestoreResult {
  generatedAt: string | null;
  collections: RestoreCollectionResult[];
  inserted: number;
  skipped: number;
  failed: number;
}

export class InvalidBackupError extends Error {}

/**
 * Insert the records a backup contains that this database does not have yet.
 *
 * Deliberately additive: nothing is deleted or overwritten, so restoring the
 * wrong file cannot destroy the live data — at worst it adds rows. Records that
 * already exist (by id) are skipped, which makes a restore re-runnable.
 */
export async function restoreSnapshot(payload: unknown): Promise<RestoreResult> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new InvalidBackupError('The file is not a JSON object.');
  }
  const snapshot = payload as Partial<Snapshot>;
  if (!snapshot.data || typeof snapshot.data !== 'object' || Array.isArray(snapshot.data)) {
    throw new InvalidBackupError('The file has no "data" section — is it a POS backup?');
  }

  const results: RestoreCollectionResult[] = [];

  for (const collection of SNAPSHOT_COLLECTIONS) {
    const incoming = (snapshot.data as Record<string, unknown>)[collection.key];
    if (!Array.isArray(incoming) || incoming.length === 0) continue;

    const candidates = incoming
      .filter((row): row is Record<string, unknown> => !!row && typeof row === 'object' && !Array.isArray(row))
      .filter((row) => typeof row.id === 'string' && row.id.length)
      .map((row) => coerceDates(without(row, collection.omit)));

    const skippedItems = incoming.length - candidates.length;
    if (!candidates.length) {
      results.push({ key: collection.key, label: collection.label, inserted: 0, skipped: skippedItems, failed: 0 });
      continue;
    }

    const existing = new Set<string>();
    for (let i = 0; i < candidates.length; i += 500) {
      const chunk = candidates.slice(i, i + 500).map((row) => row.id as string);
      (await collection.existingIds(chunk)).forEach((id) => existing.add(id));
    }
    const missing = candidates.filter((row) => !existing.has(row.id as string));

    const { inserted, failed, error } = await insertResiliently(collection, missing);

    results.push({
      key: collection.key,
      label: collection.label,
      inserted,
      skipped: skippedItems + (missing.length - inserted - failed),
      failed,
      error,
    });
  }

  return {
    generatedAt: typeof snapshot.generatedAt === 'string' ? snapshot.generatedAt : null,
    collections: results,
    inserted: results.reduce((sum, item) => sum + item.inserted, 0),
    skipped: results.reduce((sum, item) => sum + item.skipped, 0),
    failed: results.reduce((sum, item) => sum + item.failed, 0),
  };
}

/**
 * A unique field (username, station, setting key) can collide with a record
 * stored under a different id. Fall back to row-by-row so one conflict cannot
 * discard the rest of the file.
 */
async function insertResiliently(
  collection: SnapshotCollection,
  rows: Record<string, unknown>[],
): Promise<{ inserted: number; failed: number; error?: string }> {
  if (!rows.length) return { inserted: 0, failed: 0 };
  try {
    const result = await collection.insert(rows);
    return { inserted: result.count, failed: 0 };
  } catch (err) {
    logger.warn({ err, collection: collection.key }, 'Bulk restore insert failed; retrying row by row.');
    let inserted = 0;
    let firstError: string | undefined;
    for (const row of rows) {
      try {
        await collection.insert([row]);
        inserted += 1;
      } catch (rowErr) {
        if (!firstError) firstError = (rowErr as Error).message;
      }
    }
    return { inserted, failed: rows.length - inserted, error: firstError };
  }
}

/** JSON turns every Date into a string; put the timestamps back before insert. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;

function coerceDates(row: Record<string, unknown>): Record<string, unknown> {
  const copy: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    // Only top-level scalars: converting inside a Json blob would rewrite
    // stored data that merely looks like a timestamp.
    copy[key] = typeof value === 'string' && ISO_DATE.test(value) ? new Date(value) : value;
  }
  return copy;
}

// ---------------------------------------------------------------------------
// Reset (format)
// ---------------------------------------------------------------------------

/**
 * A destructive "format" of the operational books.
 *
 * Only the *business* rows go: orders, payments, expenses, payroll, attendance,
 * closes and their satellites. Staff accounts, the menu catalogue, system
 * settings, printers and the audit/login trails are deliberately kept — wiping
 * the people and the configuration would lock the operator out of the very
 * screen they used to reset the data. Take a backup first; this cannot be
 * undone from the UI.
 *
 * Order is child-before-parent even though MongoDB does not enforce foreign
 * keys, so the same list stays correct if the datasource ever becomes relational.
 */
interface ResetStep {
  key: string;
  label: string;
  count: () => Promise<number>;
  remove: () => Promise<{ count: number }>;
}

const RESET_STEPS: ReadonlyArray<ResetStep> = [
  { key: 'printJobs', label: 'Print jobs', count: () => safeCount(() => prisma.printJob.count()), remove: () => prisma.printJob.deleteMany() },
  { key: 'notifications', label: 'Notifications', count: () => safeCount(() => prisma.notification.count()), remove: () => prisma.notification.deleteMany() },
  {
    key: 'cancellationRequests',
    label: 'Cancellation requests',
    count: () => safeCount(() => prisma.orderCancellationRequest.count()),
    remove: () => prisma.orderCancellationRequest.deleteMany(),
  },
  { key: 'settlements', label: 'Payments', count: () => safeCount(() => prisma.settlement.count()), remove: () => prisma.settlement.deleteMany() },
  { key: 'orders', label: 'Sales orders', count: () => safeCount(() => prisma.order.count()), remove: () => prisma.order.deleteMany() },
  { key: 'expenses', label: 'Expenses', count: () => safeCount(() => prisma.expense.count()), remove: () => prisma.expense.deleteMany() },
  { key: 'payrollAdjustments', label: 'Payroll adjustments', count: () => safeCount(() => prisma.payrollAdjustment.count()), remove: () => prisma.payrollAdjustment.deleteMany() },
  { key: 'userPayments', label: 'Payroll payments', count: () => safeCount(() => prisma.userPayment.count()), remove: () => prisma.userPayment.deleteMany() },
  { key: 'attendance', label: 'Attendance', count: () => safeCount(() => prisma.attendance.count()), remove: () => prisma.attendance.deleteMany() },
  { key: 'dailyCloses', label: 'End-of-day closes', count: () => safeCount(() => prisma.dailyClose.count()), remove: () => prisma.dailyClose.deleteMany() },
  { key: 'integrityIssues', label: 'Integrity issues', count: () => safeCount(() => prisma.integrityIssue.count()), remove: () => prisma.integrityIssue.deleteMany() },
];

/** What a reset would remove, with row counts, for the confirmation screen. */
export async function resetPreview() {
  const collections = await Promise.all(
    RESET_STEPS.map(async (step) => ({ key: step.key, label: step.label, rows: await step.count() })),
  );
  return {
    collections,
    rows: collections.reduce((sum, item) => sum + item.rows, 0),
    keeps: RESET_KEEPS,
  };
}

/** What a reset keeps, so the confirmation dialog can be explicit about it. */
export const RESET_KEEPS = [
  'Staff accounts and roles',
  'Menu items and categories',
  'System settings and feature flags',
  'Printers and print agents',
  'Audit log and login history',
] as const;

export interface ResetCollectionResult {
  key: string;
  label: string;
  deleted: number;
}

export interface ResetResult {
  collections: ResetCollectionResult[];
  deleted: number;
  resetAt: string;
}

/**
 * Delete every operational record. Returns per-collection counts so the UI can
 * report exactly what was removed. Individual failures are collected rather
 * than thrown, so one stuck collection cannot leave the operator blind to the
 * rest of the result.
 */
export async function resetBusinessData(): Promise<ResetResult> {
  const collections: ResetCollectionResult[] = [];

  for (const step of RESET_STEPS) {
    try {
      const { count } = await step.remove();
      collections.push({ key: step.key, label: step.label, deleted: count });
    } catch (err) {
      logger.error({ err, collection: step.key }, 'Reset step failed.');
      collections.push({ key: step.key, label: step.label, deleted: 0 });
    }
  }

  return {
    collections,
    deleted: collections.reduce((sum, item) => sum + item.deleted, 0),
    resetAt: new Date().toISOString(),
  };
}
