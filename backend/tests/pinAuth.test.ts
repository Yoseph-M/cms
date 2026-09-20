/**
 * Mobile PIN authentication — POST /api/auth/pin-login.
 *
 * Waiters (and other app-facing roles) sign in by picking their name and
 * typing a PIN; managers keep their website password on top of it. These tests
 * pin the credential handling: the PIN is stored hashed, only ever reaches the
 * client as `hasPin`, and shares the account lockout with password logins.
 */
import request from 'supertest';
import { Role } from '@prisma/client';
import { getTestApp, getPrisma, seedTestUser, cleanDb, disconnectPrisma } from './helpers';

const app = getTestApp();

beforeEach(async () => {
  await cleanDb();
});

afterAll(async () => {
  await disconnectPrisma();
});

describe('PIN authentication', () => {
  it('signs an app user in with their PIN', async () => {
    const owner = await seedTestUser({ role: Role.OWNER });

    const created = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        name: 'abebe kebede',
        role: Role.WAITER,
        phone: '+251911223344',
        password: 'secret123',
        pinCode: '4321',
      });

    expect(created.status).toBe(201);
    expect(created.body.hasPin).toBe(true);
    expect(created.body.pinCodeHash).toBeUndefined();

    // Stored hashed, never in the clear.
    const p = getPrisma();
    const stored = await p.user.findUnique({ where: { id: created.body.id } });
    expect(stored?.pinCodeHash).toBeTruthy();
    expect(stored?.pinCodeHash).not.toContain('4321');

    const login = await request(app)
      .post('/api/auth/pin-login')
      .send({ userId: created.body.id, pinCode: '4321' });

    expect(login.status).toBe(200);
    expect(login.body.accessToken).toBeTruthy();
    expect(login.body.user.role).toBe(Role.WAITER);
  });

  it('rejects a wrong PIN and an account that never had one', async () => {
    const owner = await seedTestUser({ role: Role.OWNER });
    const withPin = await seedTestUser({ role: Role.WAITER });
    const withoutPin = await seedTestUser({ role: Role.CASHIER });

    await request(app)
      .patch(`/api/users/${withPin.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ pinCode: '1234' });

    const wrong = await request(app)
      .post('/api/auth/pin-login')
      .send({ userId: withPin.id, pinCode: '9999' });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error).toMatch(/invalid pin/i);

    const none = await request(app)
      .post('/api/auth/pin-login')
      .send({ userId: withoutPin.id, pinCode: '1234' });
    expect(none.status).toBe(401);
  });

  it('locks the account after repeated wrong PINs', async () => {
    const owner = await seedTestUser({ role: Role.OWNER });
    const waiter = await seedTestUser({ role: Role.WAITER });

    await request(app)
      .patch(`/api/users/${waiter.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ pinCode: '1111' });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app).post('/api/auth/pin-login').send({ userId: waiter.id, pinCode: '0000' });
    }

    // Even the correct PIN is refused while the lockout is in force.
    const locked = await request(app)
      .post('/api/auth/pin-login')
      .send({ userId: waiter.id, pinCode: '1111' });

    expect(locked.status).toBe(429);
    expect(locked.body.remainingMinutes).toBeGreaterThan(0);
  });

  it('accepts exactly four digits and nothing else', async () => {
    const owner = await seedTestUser({ role: Role.OWNER });

    const makeUser = (pinCode: string) =>
      request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({
          name: 'pin length',
          role: Role.WAITER,
          phone: '+251911223355',
          pinCode,
        });

    const fiveDigits = await makeUser('12345');
    expect(fiveDigits.status).toBe(400);

    const threeDigits = await makeUser('123');
    expect(threeDigits.status).toBe(400);

    const letters = await makeUser('12a4');
    expect(letters.status).toBe(400);

    const fourDigits = await makeUser('1234');
    expect(fourDigits.status).toBe(201);
    expect(fourDigits.body.hasPin).toBe(true);
  });

  it('creates app-only roles without any website password', async () => {
    const owner = await seedTestUser({ role: Role.OWNER });
    const p = getPrisma();

    const created = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        name: 'waiter no pass',
        role: Role.WAITER,
        username: 'waiter-no-pass',
        phone: '+251911223366',
        pinCode: '4321',
      });

    expect(created.status).toBe(201);

    // No password hash at all — not even a generated one — so the account has
    // no website credential to fall back on.
    const stored = await p.user.findUnique({ where: { id: created.body.id } });
    expect(stored?.passwordHash).toBeNull();
    expect(stored?.pinCodeHash).toBeTruthy();

    const siteLogin = await request(app)
      .post('/api/auth/login')
      .send({ username: 'waiter-no-pass', password: 'anything' });
    expect(siteLogin.status).toBe(401);
  });

  it('still demands a website password for the roles that work on the site', async () => {
    const owner = await seedTestUser({ role: Role.OWNER });

    const cashier = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'cashier no pass', role: Role.CASHIER, phone: '+251911223377' });

    expect(cashier.status).toBe(400);
    expect(cashier.body.error).toMatch(/password/i);
  });

  it('leaves an existing PIN alone when the field is left blank', async () => {
    const owner = await seedTestUser({ role: Role.OWNER });
    const waiter = await seedTestUser({ role: Role.WAITER });

    await request(app)
      .patch(`/api/users/${waiter.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ pinCode: '2468' });

    await request(app)
      .patch(`/api/users/${waiter.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ phone: '+251911999888' });

    const stillWorks = await request(app)
      .post('/api/auth/pin-login')
      .send({ userId: waiter.id, pinCode: '2468' });
    expect(stillWorks.status).toBe(200);
  });
});
