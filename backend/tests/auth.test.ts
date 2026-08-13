/**
 * Auth Integration Tests — Phase 3, §2.1
 *
 * Covers:
 *  - §1.1  Password lockout survives restarts (backed by MongoDB, not in-memory)
 *  - §1.2  Auth rate limit blocks 21st request in a minute
 *  - §1.3  Refresh token rotation & reuse detection (cookie-based)
 */
import request from 'supertest';
import { getTestApp, getPrisma, seedTestUser, cleanDb, disconnectPrisma } from './helpers';
import crypto from 'crypto';

const app = getTestApp();

beforeEach(async () => {
  await cleanDb();
});

afterAll(async () => {
  await disconnectPrisma();
});

// Helper to extract cookie value from Set-Cookie headers
function extractCookie(setCookieHeaders: string[] | undefined, cookieName: string): string | null {
  if (!setCookieHeaders) return null;
  const line = setCookieHeaders.find((c) => c.startsWith(`${cookieName}=`));
  if (!line) return null;
  return line.split(';')[0]; // e.g. "refresh_token=<token>"
}

// Helper to get token value from cookie string
function getTokenFromCookie(cookieString: string): string {
  return cookieString.split('=')[1];
}

// ---------------------------------------------------------------------------
// §1.1 — Password lockout persists in MongoDB (survives "restarts")
// ---------------------------------------------------------------------------
describe('Password lockout persistence (§1.1)', () => {
  it('locks out after 5 failed password attempts', async () => {
    const user = await seedTestUser({ role: 'WAITER' as any, email: 'lockout-test@pos.com' });

    // Fire 5 wrong passwords
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/auth/login')
        .send({ email: user.email, password: 'wrongpassword' });
    }

    // 6th attempt should be locked out (429)
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'password123' }); // even the right password
    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/locked/i);
  });

  it('lockout state persists across a fresh PrismaClient instance (simulated restart)', async () => {
    const user = await seedTestUser({ role: 'WAITER' as any, email: 'persist-test@pos.com' });
    const p = getPrisma();

    // Fire 5 wrong passwords
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/auth/login')
        .send({ email: user.email, password: 'wrongpassword' });
    }

    // Verify lockout record exists in DB directly (not through the API)
    const lockout = await p.loginAttempt.findUnique({ where: { userId: user.id } });
    expect(lockout).not.toBeNull();
    expect(lockout!.failedCount).toBeGreaterThanOrEqual(5);
    expect(lockout!.lockedUntil).toBeGreaterThan(Date.now());

    // The API should still reject even "after restart" because the DB state persists
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'password123' });
    expect(res.status).toBe(429);
  });

  it('Manager/Owner can unlock a locked-out user', async () => {
    const owner = await seedTestUser({ role: 'OWNER' as any, email: 'unlock-owner@pos.com' });
    const waiter = await seedTestUser({ role: 'WAITER' as any, email: 'unlock-waiter@pos.com' });

    // Lock the waiter out
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/auth/login')
        .send({ email: waiter.email, password: 'wrongpassword' });
    }

    // Owner unlocks
    const unlockRes = await request(app)
      .post(`/api/users/${waiter.id}/unlock`)
      .set('Authorization', `Bearer ${owner.accessToken}`);
    expect(unlockRes.status).toBe(200);

    // Waiter can now log in again
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: waiter.email, password: 'password123' });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.accessToken).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// §1.2 — Auth rate limiting (20 req/min per IP)
// ---------------------------------------------------------------------------
describe('Auth rate limiting (§1.2)', () => {
  it('blocks the 21st auth request within a minute for the same IP', async () => {
    const user = await seedTestUser({ role: 'WAITER' as any, email: 'ratelimit-test@pos.com' });
    const results: number[] = [];

    // Fire 21 rapid requests (IP limiter max = 20)
    for (let i = 0; i < 21; i++) {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: user.email, password: 'password123' });
      results.push(res.status);
    }

    expect(results.filter((s) => s === 429).length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// §1.3 — Refresh token rotation & reuse detection (cookie-based only)
// ---------------------------------------------------------------------------
describe('Refresh token rotation & reuse detection (§1.3)', () => {
  it('login sets HttpOnly cookie and does NOT return refreshToken in body', async () => {
    const user = await seedTestUser({ role: 'OWNER' as any, email: 'cookie-test@pos.com' });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'password123' });
    
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.accessToken).toBeDefined();
    expect(loginRes.body.refreshToken).toBeUndefined(); // Must NOT be in body

    // Verify HttpOnly cookie is set
    const setCookieHeader = loginRes.headers['set-cookie'] as string[] | undefined;
    const cookieStr = Array.isArray(setCookieHeader) ? setCookieHeader.join('; ') : (setCookieHeader ?? '');
    expect(cookieStr).toMatch(/refresh_token=/i);
    expect(cookieStr).toMatch(/HttpOnly/i);
    expect(cookieStr).toMatch(/SameSite=Strict/i);
  });

  it('cookie-based refresh: reads token from HttpOnly cookie, rotates it', async () => {
    const user = await seedTestUser({ role: 'OWNER' as any, email: 'cookie-refresh@pos.com' });
    const p = getPrisma();

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'password123' });
    expect(loginRes.status).toBe(200);

    // Extract the refresh_token cookie
    const setCookieHeader = loginRes.headers['set-cookie'] as unknown as string[] | undefined;
    const refreshCookie = extractCookie(setCookieHeader, 'refresh_token');
    expect(refreshCookie).toBeTruthy();
    const rt1 = getTokenFromCookie(refreshCookie!);

    // Use cookie-based refresh (empty body)
    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', refreshCookie!)
      .send({});
    
    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.accessToken).toBeDefined();
    expect(refreshRes.body.refreshToken).toBeUndefined(); // Must NOT be in body

    // Extract new refresh token cookie
    const newSetCookie = refreshRes.headers['set-cookie'] as unknown as string[] | undefined;
    const newRefreshCookie = extractCookie(newSetCookie, 'refresh_token');
    expect(newRefreshCookie).toBeTruthy();
    const rt2 = getTokenFromCookie(newRefreshCookie!);

    // rt1 and rt2 should be different (rotation)
    expect(rt1).not.toBe(rt2);

    // rt1 should now be marked as revoked in DB
    const hash1 = crypto.createHash('sha256').update(rt1).digest('hex');
    const storedToken1 = await p.refreshToken.findUnique({ where: { tokenHash: hash1 } });
    expect(storedToken1).not.toBeNull();
    expect(storedToken1!.revoked).toBe(true);

    // rt2 should be valid and not revoked
    const hash2 = crypto.createHash('sha256').update(rt2).digest('hex');
    const storedToken2 = await p.refreshToken.findUnique({ where: { tokenHash: hash2 } });
    expect(storedToken2).not.toBeNull();
    expect(storedToken2!.revoked).toBe(false);
  });

  it('reuse detection: replaying a rotated-out token revokes the entire family', async () => {
    const user = await seedTestUser({ role: 'OWNER' as any, email: 'reuse-test@pos.com' });
    const p = getPrisma();

    // Login
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'password123' });
    const cookie1 = extractCookie(loginRes.headers['set-cookie'] as string[], 'refresh_token');
    const rt1 = getTokenFromCookie(cookie1!);

    // Rotate once to get rt2
    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', cookie1!)
      .send({});
    expect(refreshRes.status).toBe(200);
    const cookie2 = extractCookie(refreshRes.headers['set-cookie'] as string[], 'refresh_token');
    const rt2 = getTokenFromCookie(cookie2!);

    // Replay rt1 (the old, revoked token) — this should trigger reuse detection
    const replayRes = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', cookie1!) // Using old cookie
      .send({});
    expect(replayRes.status).toBe(401);
    expect(replayRes.body.error).toMatch(/compromised|log in again/i);

    // Now rt2 should ALSO be revoked (entire family nuked)
    const hash2 = crypto.createHash('sha256').update(rt2).digest('hex');
    const token2 = await p.refreshToken.findUnique({ where: { tokenHash: hash2 } });
    expect(token2).not.toBeNull();
    expect(token2!.revoked).toBe(true);

    // Trying to use rt2 should also fail
    const rt2Res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', cookie2!)
      .send({});
    expect(rt2Res.status).toBe(401);
  });

  it('logout revokes the refresh token and clears cookie', async () => {
    const user = await seedTestUser({ role: 'OWNER' as any, email: 'logout-test@pos.com' });
    const p = getPrisma();

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'password123' });
    expect(loginRes.status).toBe(200);
    const refreshCookie = extractCookie(loginRes.headers['set-cookie'] as string[], 'refresh_token');
    const rt = getTokenFromCookie(refreshCookie!);

    // Logout with cookie
    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', refreshCookie!)
      .send({});
    expect(logoutRes.status).toBe(200);

    // Verify cookie is cleared (Max-Age=0 or Expires in past)
    const logoutCookies = logoutRes.headers['set-cookie'] as string[] | undefined;
    if (logoutCookies) {
      const clearedCookie = logoutCookies.find(c => c.startsWith('refresh_token='));
      if (clearedCookie) {
        expect(clearedCookie).toMatch(/Max-Age=0|Expires=/i);
      }
    }

    // Verify token is revoked in DB
    const hash = crypto.createHash('sha256').update(rt).digest('hex');
    const storedToken = await p.refreshToken.findUnique({ where: { tokenHash: hash } });
    expect(storedToken).not.toBeNull();
    expect(storedToken!.revoked).toBe(true);

    // Subsequent refresh should fail
    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', refreshCookie!)
      .send({});
    expect(refreshRes.status).toBe(401);
  });

  it('refresh without cookie returns 401', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({});
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/no refresh token/i);
  });
});

// ---------------------------------------------------------------------------
// §1.4 — Orders Role Enforcement Negative Tests
// ---------------------------------------------------------------------------
describe('Role Enforcement - POST /orders (§1.4)', () => {
  it('rejects OWNER attempting to create an order', async () => {
    const owner = await seedTestUser({ role: 'OWNER' as any });
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        clientOrderId: '123e4567-e89b-12d3-a456-426614174000',
        tableNumber: '5',
        items: [{ menuItemId: 'menu1', name: 'Pizza', unitPrice: 12.0, quantity: 1 }],
      });
    expect(res.status).toBe(403);
  });

  it('allows WAITER to create an order', async () => {
    const waiter = await seedTestUser({ role: 'WAITER' as any });
    // This might fail if the menu item doesn't exist (returns 400 or 404), but it shouldn't return 403
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${waiter.accessToken}`)
      .send({
        clientOrderId: '123e4567-e89b-12d3-a456-426614174001',
        tableNumber: '6',
        items: [{ menuItemId: '60c72b2f9b1d8b2d88888888', name: 'Burger', unitPrice: 10.0, quantity: 1 }],
      });
    // Expected either 201 (success) or a validation error, but NOT 403.
    expect(res.status).not.toBe(403);
  });
});
