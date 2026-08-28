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

// JWT Tokens
export interface TokenPayload {
  userId: string;
  role: Role;
  name: string;
  email?: string | null;
}

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
