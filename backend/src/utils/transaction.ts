/**
 * Transaction Wrapper Utility
 * 
 * Provides conditional transaction support for MongoDB.
 * - Replica Set mode: Uses full Prisma transactions for ACID guarantees
 * - Standalone mode: Falls back to sequential operations with optimistic locking
 * 
 * MongoDB requires a replica set to support multi-document transactions.
 * This wrapper allows the application to run in both configurations.
 */

import { PrismaClient } from '@prisma/client';
import { logger } from './logger';

let transactionModeDetected = false;
let supportsTransactions = false;

/**
 * Detect if MongoDB supports transactions (replica set mode)
 * This check is performed once at startup
 */
export async function detectTransactionSupport(prisma: PrismaClient): Promise<boolean> {
  if (transactionModeDetected) {
    return supportsTransactions;
  }

  try {
    // Try to start a session - this will fail on standalone MongoDB
    await prisma.$runCommandRaw({
      startSession: 1,
    });

    // If we get here, sessions are supported, meaning replica set is available
    supportsTransactions = true;
    logger.info('✓ MongoDB transaction support detected (replica set mode)');
  } catch (error: any) {
    // Standalone MongoDB doesn't support sessions/transactions
    supportsTransactions = false;
    logger.warn(
      'MongoDB transactions NOT supported (standalone mode). ' +
      'Using sequential operations with optimistic locking. ' +
      'For production, configure MongoDB as a replica set.'
    );
  }

  transactionModeDetected = true;
  return supportsTransactions;
}

/**
 * Execute operations within a transaction if supported, otherwise sequentially
 * 
 * @param prisma - Prisma client instance
 * @param callback - Function containing operations to execute
 * @returns Result from callback
 */
export async function executeInTransaction<T>(
  prisma: PrismaClient,
  callback: (tx: PrismaClient) => Promise<T>
): Promise<T> {
  // Ensure we've detected transaction support
  if (!transactionModeDetected) {
    await detectTransactionSupport(prisma);
  }

  if (supportsTransactions) {
    // Use full Prisma transaction with ACID guarantees
    return prisma.$transaction(callback);
  } else {
    // Fall back to sequential execution using the main prisma client
    // The caller must implement optimistic locking via updateMany with WHERE clauses
    logger.debug('Executing operations sequentially (no transaction support)');
    return callback(prisma);
  }
}

/**
 * Check if optimistic lock succeeded (for standalone mode)
 * 
 * @param updateCount - Number of rows affected by updateMany
 * @throws Error if optimistic lock failed (concurrent modification)
 */
export function checkOptimisticLock(updateCount: number, entityName: string): void {
  if (updateCount === 0) {
    throw new Error(
      `${entityName.toUpperCase()}_CONFLICT: ${entityName} was modified concurrently. Please retry.`
    );
  }
}

/**
 * Get current transaction mode for logging/debugging
 */
export function getTransactionMode(): 'replica-set' | 'standalone' | 'unknown' {
  if (!transactionModeDetected) {
    return 'unknown';
  }
  return supportsTransactions ? 'replica-set' : 'standalone';
}

/**
 * Check if transactions are supported
 */
export function transactionsSupported(): boolean {
  return supportsTransactions;
}
