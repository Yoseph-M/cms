import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { Role } from '@prisma/client';

// Passwords (bcrypt for all staff roles)
import bcrypt from 'bcrypt';

export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 10;
  return bcrypt.hash(password, saltRounds);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// App PINs (4-digit numeric codes used by the mobile app).
// Unsalted SHA-256 hex — the scheme the original accounts were created with,
// which is what the mobile app verifies against. A PIN set from the staff
// card therefore produces the same 64-hex format as the pre-existing rows.
// The 4-digit space is only 10,000 values, so a slow salted hash would not
// meaningfully resist offline brute force anyway; the endpoint lockout
// (5 tries → 15 min) is what actually protects PINs.
export function hashPin(pin: string): string {
  return crypto.createHash('sha256').update(pin, 'utf8').digest('hex');
}

export function comparePin(pin: string, storedHash: string): boolean {
  if (!storedHash) return false;
  // Rows written while the code briefly used bcrypt ($2b$…) — PINs set from
  // the site in that window. Accept them so those credentials keep working,
  // even though the app-facing format is SHA-256 above.
  if (storedHash.startsWith('$2')) {
    try {
      return bcrypt.compareSync(pin, storedHash);
    } catch {
      return false;
    }
  }
  try {
    const computed = Buffer.from(hashPin(pin), 'hex');
    const stored = Buffer.from(storedHash, 'hex');
    return computed.length === stored.length && crypto.timingSafeEqual(computed, stored);
  } catch {
    return false;
  }
}

// JWT Tokens
export interface TokenPayload {
  userId: string;
  role: Role;
  name: string;
  username?: string | null;
}

// Access tokens are short-lived by design — the frontend refreshes
// proactively every 90 minutes (see App.tsx), so normal user requests should
// never hit a 401 mid-session. If you change this TTL, keep it comfortably
// longer than the frontend's refresh interval.
export function generateAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: '2h' });
}

export function generateRefreshToken(payload: TokenPayload): string {
  // jti ensures tokens issued in the same second are always unique (rotation)
  return jwt.sign({ ...payload, jti: crypto.randomUUID() }, config.jwtRefreshSecret, { expiresIn: '7d' });
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, config.jwtSecret) as TokenPayload;
}

export function verifyRefreshToken(token: string): TokenPayload {
  return jwt.verify(token, config.jwtRefreshSecret) as TokenPayload;
}
