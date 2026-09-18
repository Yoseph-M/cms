/**
 * Unified audit feed + backup/restore tests.
 *
 * The feed merges two collections behind one cursor, which is exactly the kind
 * of logic that looks right and skips a row in production — so the paging,
 * filtering and search paths are all exercised here. The restore tests pin the
 * promise the UI makes: a restore only ever adds.
 */
import request from 'supertest';
import { Role } from '@prisma/client';
import { getTestApp, getPrisma, seedTestUser, cleanDb, disconnectPrisma } from './helpers';
import { describeActivity, queryAuditFeed } from '../src/modules/audit/auditFeed';
import {
  InvalidBackupError,
  buildSnapshot,
  restoreSnapshot,
  toCsv,
} from '../src/modules/backup/backup.service';

const app = getTestApp();

const OWNER_ACTION_AT = new Date('2026-09-17T22:34:42.000Z');
const WAITER_CANCEL_AT = new Date('2026-09-17T20:10:00.000Z');
const WAITER_FAILED_LOGIN_AT = new Date('2026-09-17T18:00:00.000Z');
const WAITER_LOGGED_IN_AT = new Date('2026-09-17T17:59:00.000Z');

const ORDER_ID = '665f1c2b3d4e5f6a7b8c9d0e';

/** Two staff members, four events, interleaved across both collections. */
async function seedFeed() {
  const owner = await seedTestUser({ role: Role.OWNER, name: 'Alice Owner', username: 'alice' });
  const waiter = await seedTestUser({ role: Role.WAITER, name: 'Yosef', username: 'yosef' });
  const p = getPrisma();

  await p.loginHistory.create({
    data: { userId: owner.id, outcome: 'SUCCESS', ip: '10.0.0.4', userAgent: 'Chrome', createdAt: OWNER_ACTION_AT },
  });
  await p.auditLog.create({
    data: {
      actorId: waiter.id,
      actionType: 'ORDER_CANCELLED',
      targetType: 'Order',
      targetId: ORDER_ID,
      details: { reason: 'customer left' },
      timestamp: WAITER_CANCEL_AT,
    },
  });
  await p.loginHistory.create({
    data: { userId: waiter.id, outcome: 'FAILURE', ip: '10.0.0.9', userAgent: 'Firefox', createdAt: WAITER_FAILED_LOGIN_AT },
  });
  await p.loginHistory.create({
    data: { userId: waiter.id, outcome: 'SUCCESS', createdAt: WAITER_LOGGED_IN_AT },
  });

  return { owner, waiter };
}

beforeEach(async () => {
  await cleanDb();
});

afterAll(async () => {
  await disconnectPrisma();
});

describe('unified audit feed', () => {
  it('orders activity and logins together, newest first', async () => {
    await seedFeed();

    const page = await queryAuditFeed({ limit: 10 });

    expect(page.total).toBe(4);
    expect(page.rows.map((row) => row.action)).toEqual(['LOGIN', 'ORDER_CANCELLED', 'LOGIN_FAILED', 'LOGIN']);
    expect(page.rows.map((row) => row.kind)).toEqual(['LOGIN', 'ACTIVITY', 'LOGIN', 'LOGIN']);
    // Oldest first is the same stream read the other way.
    const oldest = await queryAuditFeed({ limit: 10, order: 'asc' });
    expect(oldest.rows.map((row) => row.action)).toEqual(['LOGIN', 'LOGIN_FAILED', 'ORDER_CANCELLED', 'LOGIN']);
  });

  it('pages the merged stream without gaps or repeats', async () => {
    await seedFeed();

    const first = await queryAuditFeed({ limit: 2 });
    expect(first.rows).toHaveLength(2);
    expect(first.nextCursor).toBeTruthy();

    const second = await queryAuditFeed({ limit: 2, cursor: first.nextCursor! });
    const ids = [...first.rows, ...second.rows].map((row) => row.id);

    expect(second.rows).toHaveLength(2);
    expect(new Set(ids).size).toBe(4);
    expect(second.nextCursor).toBeNull();

    // The two pages must still read as one descending timeline.
    const timestamps = [...first.rows, ...second.rows].map((row) => Date.parse(row.timestamp));
    expect(timestamps).toEqual([...timestamps].sort((a, b) => b - a));
  });

  it('filters each stream by action and by entity', async () => {
    await seedFeed();

    const onlyLogins = await queryAuditFeed({ limit: 10, action: 'LOGIN' });
    expect(onlyLogins.rows).toHaveLength(2);
    expect(onlyLogins.rows.every((row) => row.kind === 'LOGIN')).toBe(true);
    expect(onlyLogins.total).toBe(2);

    // An activity action can never match a login row, and vice versa.
    const onlyCancellations = await queryAuditFeed({ limit: 10, action: 'ORDER_CANCELLED' });
    expect(onlyCancellations.rows).toHaveLength(1);
    expect(onlyCancellations.rows[0].entity).toBe('Order');

    const onlyOrders = await queryAuditFeed({ limit: 10, entity: 'Order' });
    expect(onlyOrders.rows).toHaveLength(1);
    expect(onlyOrders.rows[0].action).toBe('ORDER_CANCELLED');

    // Every login row is a user event, so the User entity keeps them.
    const users = await queryAuditFeed({ limit: 10, entity: 'User' });
    expect(users.rows).toHaveLength(3);
  });

  it('finds a staff member across both collections', async () => {
    await seedFeed();

    const page = await queryAuditFeed({ limit: 10, search: 'yosef' });

    expect(page.total).toBe(3);
    expect(page.rows.every((row) => row.actor?.name === 'Yosef')).toBe(true);
    // Their own failed login is part of the answer, not a different question.
    expect(page.rows.some((row) => row.action === 'LOGIN_FAILED')).toBe(true);
  });

  it('finds the history of a record id pasted from the details drawer', async () => {
    await seedFeed();

    const page = await queryAuditFeed({ limit: 10, search: ORDER_ID });

    expect(page.rows).toHaveLength(1);
    expect(page.rows[0].description).toBe('Order cancelled: customer left');
  });

  it('returns nothing (rather than everything) when a search cannot match', async () => {
    await seedFeed();

    const page = await queryAuditFeed({ limit: 10, search: 'zzzz-no-such-thing' });

    expect(page.rows).toEqual([]);
    expect(page.total).toBe(0);
    // The filter dropdowns still describe what exists.
    expect(page.facets.actions).toContain('ORDER_CANCELLED');
  });

  it('phrases events so the description column reads like a sentence', () => {
    expect(describeActivity('ORDER_CANCELLED', { reason: 'customer left' })).toBe(
      'Order cancelled: customer left',
    );
    // Unregistered actions still get words, not shouting.
    expect(describeActivity('SOMETHING_NEW')).toBe('Something new');
  });
});

describe('backup dataset exports', () => {
  it('quotes CSV values that contain commas, quotes or newlines', () => {
    const csv = toCsv(
      [
        { header: 'Name', value: (row) => row.name },
        { header: 'Note', value: (row) => row.note },
      ],
      [{ name: 'Wagyu Burger, large', note: 'He said "rare"\nno onions' }],
    );

    const [header, body] = csv.trim().split('\r\n');
    expect(header).toBe('Name,Note');
    expect(body).toBe('"Wagyu Burger, large","He said ""rare""\nno onions"');
  });

  it('exports a dataset as a CSV download', async () => {
    const owner = await seedTestUser({ role: Role.OWNER, username: 'csv-owner' });
    await getPrisma().menuItem.create({
      data: { name: 'Doro Wat', category: 'FOOD', price: 220, isAvailable: true },
    });

    const res = await request(app)
      .get('/api/backup/datasets/menu/csv')
      .set('Authorization', `Bearer ${owner.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('pos-menu-');
    expect(res.text).toContain('Name,Name (Amharic),Category');
    expect(res.text).toContain('Doro Wat');
  });

  it('rejects an unknown dataset instead of guessing', async () => {
    const owner = await seedTestUser({ role: Role.OWNER, username: 'csv-owner-2' });

    const res = await request(app)
      .get('/api/backup/datasets/nope/csv')
      .set('Authorization', `Bearer ${owner.accessToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('Unknown dataset');
  });

  it('keeps backups OWNER-only', async () => {
    const cashier = await seedTestUser({ role: Role.CASHIER, username: 'backup-cashier' });

    const anonymous = await request(app).get('/api/backup/datasets');
    expect(anonymous.status).toBe(401);

    const forbidden = await request(app)
      .get('/api/backup/snapshot')
      .set('Authorization', `Bearer ${cashier.accessToken}`);
    expect(forbidden.status).toBe(403);

    const audit = await request(app)
      .get('/api/audit/feed')
      .set('Authorization', `Bearer ${cashier.accessToken}`);
    expect(audit.status).toBe(403);
  });

  it('lists exportable datasets with row counts', async () => {
    const owner = await seedTestUser({ role: Role.OWNER, username: 'list-owner' });
    await getPrisma().menuItem.create({
      data: { name: 'Buna', category: 'DRINK', price: 40, isAvailable: true },
    });

    const res = await request(app)
      .get('/api/backup/datasets')
      .set('Authorization', `Bearer ${owner.accessToken}`);

    expect(res.status).toBe(200);
    const menu = res.body.datasets.find((dataset: { key: string }) => dataset.key === 'menu');
    expect(menu.rows).toBe(1);
    expect(res.body.datasets.map((d: { key: string }) => d.key)).toContain('audit');
  });
});

describe('backup snapshot and restore', () => {
  it('never writes passwords or agent tokens to the file', async () => {
    const owner = await seedTestUser({ role: Role.OWNER, username: 'snapshot-owner' });
    await getPrisma().printAgent.create({
      data: { name: 'Kitchen PC', station: 'kitchen', tokenHash: 'hashed-agent-token' },
    });

    const snapshot = await buildSnapshot();

    expect(snapshot.format).toBe('mern-pos-backup');
    expect(snapshot.counts.users).toBeGreaterThan(0);
    const user = (snapshot.data.users as Array<Record<string, unknown>>).find((row) => row.id === owner.id);
    expect(user).toBeDefined();
    expect(user).not.toHaveProperty('passwordHash');
    expect((snapshot.data.printAgents as Array<Record<string, unknown>>)[0]).not.toHaveProperty('tokenHash');
  });

  it('adds missing records and leaves existing ones alone', async () => {
    const owner = await seedTestUser({ role: Role.OWNER, username: 'restore-owner' });
    const disappeared = await getPrisma().menuItem.create({
      data: { name: 'Deleted Dish', category: 'FOOD', price: 150, isAvailable: true },
    });

    const snapshot = await buildSnapshot();
    await getPrisma().menuItem.delete({ where: { id: disappeared.id } });

    const first = await restoreSnapshot(snapshot);
    expect(first.inserted).toBeGreaterThan(0);
    expect(first.failed).toBe(0);
    expect(await getPrisma().menuItem.findUnique({ where: { id: disappeared.id } })).not.toBeNull();
    // The account that ran the restore is still there — a restore never deletes.
    expect(await getPrisma().user.findUnique({ where: { id: owner.id } })).not.toBeNull();

    // Re-running the same file is a no-op, which makes a retry safe.
    const second = await restoreSnapshot(snapshot);
    expect(second.inserted).toBe(0);
    expect(second.failed).toBe(0);
  });

  it('restores an uploaded snapshot through the API', async () => {
    const owner = await seedTestUser({ role: Role.OWNER, username: 'upload-owner' });
    const itemId = '665f1c2b3d4e5f6a7b8c9d0f';

    const res = await request(app)
      .post('/api/backup/restore')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        format: 'mern-pos-backup',
        version: 1,
        generatedAt: '2026-09-17T10:00:00.000Z',
        data: {
          menuItems: [
            {
              id: itemId,
              name: 'Restored Dish',
              category: 'FOOD',
              price: 175,
              isAvailable: true,
              createdAt: '2026-09-01T08:00:00.000Z',
              updatedAt: '2026-09-01T08:00:00.000Z',
            },
          ],
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.inserted).toBe(1);
    const restored = await getPrisma().menuItem.findUnique({ where: { id: itemId } });
    expect(restored?.name).toBe('Restored Dish');
    // JSON has no dates — the ISO string must come back as a real timestamp.
    expect(restored?.createdAt.toISOString()).toBe('2026-09-01T08:00:00.000Z');
  });

  it('downloads a snapshot and rejects a file that is not one', async () => {
    const owner = await seedTestUser({ role: Role.OWNER, username: 'download-owner' });

    const download = await request(app)
      .get('/api/backup/snapshot')
      .set('Authorization', `Bearer ${owner.accessToken}`);
    expect(download.status).toBe(200);
    expect(download.headers['content-disposition']).toContain('pos-backup-');

    const bad = await request(app)
      .post('/api/backup/restore')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ hello: 'world' });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toContain('data');
  });

  it('refuses a payload with no data section', async () => {
    await expect(restoreSnapshot({})).rejects.toBeInstanceOf(InvalidBackupError);
    await expect(restoreSnapshot([])).rejects.toBeInstanceOf(InvalidBackupError);
  });
});
