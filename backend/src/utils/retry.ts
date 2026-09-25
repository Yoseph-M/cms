import { Prisma } from '@prisma/client';
import { logger } from './logger';

/**
 * Retries a Prisma operation on transient connection errors (P2010, P1017, P1001, P1002).
 * Uses exponential backoff: 200ms → 400ms → 800ms (default 3 attempts).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  { attempts = 3, baseDelayMs = 200, label = 'prisma' } = {},
): Promise<T> {
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      const isTransient =
        err instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2010', 'P1017', 'P1001', 'P1002'].includes(err.code);

      if (!isTransient || i === attempts) throw err;

      const delay = baseDelayMs * 2 ** (i - 1);
      logger.warn({ attempt: i, code: (err as any).code, label, delay }, `Transient Prisma error — retrying in ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  // Unreachable, but satisfies TS
  throw new Error('withRetry exhausted');
}
