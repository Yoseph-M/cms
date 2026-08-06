import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config';

// PINs (SHA-256 with per-user salt)
export function hashPin(pin: string, customSalt?: string): { salt: string; hash: string } {
  const salt = customSalt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHmac('sha256', salt).update(pin).digest('hex');
  return { salt, hash };
}

export function comparePin(pin: string, storedSalt: string, storedHash: string): boolean {
  const computedHash = crypto.createHmac('sha256', storedSalt).update(pin).digest('hex');
  return computedHash === storedHash;
}

// Passwords (bcrypt for Owner/Manager/Cashier)
import bcrypt from 'bcrypt';

export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 10;
  return bcrypt.hash(password, saltRounds);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function isValidPinFormat(pin: string): boolean {
  if (!/^\d{4}$/.test(pin)) return false;
  // Reject trivial pins
  const trivial = ['0000', '1111', '1234', '9999', '2222', '3333', '4444', '5555', '6666', '7777', '8888'];
  if (trivial.includes(pin)) return false;
  return true;
}

// JWT Tokens
export interface TokenPayload {
  userId: string;
  role: string;
  name: string;
  email?: string | null;
}

export function generateAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: '15m' });
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
