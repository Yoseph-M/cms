/**
 * Staff removal (DELETE /api/users/:id) — permanent removal with a history
 * guard, plus the name capitalisation the roster relies on.
 */
import request from 'supertest';
import { Role, AttendanceStatus } from '@prisma/client';
import { getTestApp, getPrisma, seedTestUser, cleanDb, disconnectPrisma } from './helpers';

const app = getTestApp();

beforeEach(async () => {
  await cleanDb();
});

afterAll(async () => {
  await disconnectPrisma();
});

describe('Staff removal', () => {
  it('removes a staff member who has no business history', async () => {
    const owner = await seedTestUser({ role: Role.OWNER });
    const waiter = await seedTestUser({ role: Role.WAITER });

    const res = await request(app)
      .delete(`/api/users/${waiter.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`);

    expect(res.status).toBe(200);

    const p = getPrisma();
    expect(await p.user.findUnique({ where: { id: waiter.id } })).toBeNull();
  });

  it('refuses to remove an account that appears in the business record', async () => {
    const owner = await seedTestUser({ role: Role.OWNER });
    const waiter = await seedTestUser({ role: Role.WAITER });
    const p = getPrisma();

    await p.attendance.create({
      data: { userId: waiter.id, date: '2026-09-01', status: AttendanceStatus.PRESENT },
    });

    const res = await request(app)
      .delete(`/api/users/${waiter.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`);

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/deactivate/i);

    // The account and its history are untouched.
    expect(await p.user.findUnique({ where: { id: waiter.id } })).not.toBeNull();
    expect(await p.attendance.count({ where: { userId: waiter.id } })).toBe(1);
  });

  it('keeps the owner account and never lets a manager remove a peer', async () => {
    const owner = await seedTestUser({ role: Role.OWNER });
    const manager = await seedTestUser({ role: Role.MANAGER });
    const otherManager = await seedTestUser({ role: Role.MANAGER });

    const ownerDelete = await request(app)
      .delete(`/api/users/${owner.id}`)
      .set('Authorization', `Bearer ${manager.accessToken}`);
    expect(ownerDelete.status).toBe(403);

    const peerDelete = await request(app)
      .delete(`/api/users/${otherManager.id}`)
      .set('Authorization', `Bearer ${manager.accessToken}`);
    expect(peerDelete.status).toBe(403);

    const p = getPrisma();
    expect(await p.user.findUnique({ where: { id: otherManager.id } })).not.toBeNull();
  });

  it('rejects removing your own account', async () => {
    const owner = await seedTestUser({ role: Role.OWNER });

    const res = await request(app)
      .delete(`/api/users/${owner.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`);

    expect(res.status).toBe(400);
  });

  it('stores names capitalised so the roster reads consistently', async () => {
    const owner = await seedTestUser({ role: Role.OWNER });

    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        name: 'abebe kebede',
        role: Role.WAITER,
        phone: '+251911223344',
        password: 'secret123',
      });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Abebe Kebede');
  });
});
