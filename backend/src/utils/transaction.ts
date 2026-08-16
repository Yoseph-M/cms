/**
 * Transaction Wrapper Utility
 * 
 * Provides transaction support for MongoDB with explicit capability detection.
 * Critical financial operations require real transactions and will fail if unavailable.
 * 
 * MongoDB requires a replica set to support multi-document transactions.
 */

import { PrismaClient } from '@prisma/client';
import { logger } from './logger';

export type TransactionCapability = 'SUPPORTED' | 'UNSUPPORTED' | 'UNKNOWN';

let transactionCapability: TransactionCapability = 'UNKNOWN';
let capabilityCheckComplete = false;

/**
 * Detect if MongoDB supports transactions (replica set mode)
 * This check is performed once at startup
 */
export async function detectTransactionSupport(prisma: PrismaClient): Promise<TransactionCapability> {
  if (capabilityCheckComplete) {
    return transactionCapability;
  }

  try {
    // Try to get server status which indicates replica set status
    const serverStatus = await prisma.$runCommandRaw({
      serverStatus: 1,
    });
    
    // Check if we're in a replica set (transactions are supported)
    const isReplSet = serverStatus && (
      (serverStatus as any).process === 'mongos' || 
      ((serverStatus as any).repl?.setName) !== undefined
    );
    
    if (isReplSet) {
      transactionCapability = 'SUPPORTED';
      logger.info('MongoDB transaction support detected (replica set mode)');
    } else {
      // Try an actual transaction to confirm
      try {
        await prisma.$transaction(async (tx) => {
          // Simple read operation within transaction
          await tx.systemSetting.findFirst();
        });
        transactionCapability = 'SUPPORTED';
        logger.info('MongoDB transaction support confirmed via test transaction');
      } catch {
        transactionCapability = 'UNSUPPORTED';
        logger.warn(
          'MongoDB transactions NOT supported (standalone mode). ' +
          'Critical operations will fail. For production, configure MongoDB as a replica set.'
        );
      }
    }
  } catch (error: unknown) {
    transactionCapability = 'UNKNOWN';
    logger.error({ error }, 'Failed to detect MongoDB transaction support');
  }

  capabilityCheckComplete = true;
  return transactionCapability;
}

/**
 * Ensure the system has transaction support for critical operations.
 * Fails in production if transactions are unavailable.
 */
export async function requireTransactionSupport(prisma: PrismaClient): Promise<void> {
  const capability = await detectTransactionSupport(prisma);
  
  if (capability === 'UNSUPPORTED' && process.env.NODE_ENV === 'production') {
    const error = 'FATAL: Production MongoDB transaction support is required. ' +
      'Configure MongoDB as a replica set or transaction-capable managed deployment.';
    logger.error(error);
    throw new Error(error);
  }
  
  if (capability === 'UNKNOWN') {
    logger.warn('MongoDB transaction capability is unknown - proceeding with caution');
  }
}

/**
 * Execute operations within a transaction if supported, otherwise sequentially
 * 
 * WARNING: This should NOT be used for critical financial operations.
 * Use executeInCriticalTransaction for settlements and cancellations.
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
  if (!capabilityCheckComplete) {
    await detectTransactionSupport(prisma);
  }

  if (transactionCapability === 'SUPPORTED') {
    // Use full Prisma transaction with ACID guarantees
    return await prisma.$transaction(callback as any) as T;
  } else {
    // Fall back to sequential execution using the main prisma client
    // The caller must implement optimistic locking via updateMany with WHERE clauses
    logger.debug('Executing operations without transaction (fallback mode)');
    return await callback(prisma);
  }
}

/**
 * Execute critical financial operations only with real transactions.
 * Will fail if transactions are unavailable.
 * 
 * @param prisma - Prisma client instance
 * @param callback - Function containing operations to execute
 * @param options - Transaction options (timeout, isolation level)
 * @returns Result from callback
 * @throws Error if transactions are not supported
 */
export async function executeInCriticalTransaction<T>(
  prisma: PrismaClient,
  callback: (tx: PrismaClient) => Promise<T>,
  options?: { timeout?: number; maxWait?: number }
): Promise<T> {
  // Ensure we've detected transaction support
  if (!capabilityCheckComplete) {
    await detectTransactionSupport(prisma);
  }

  // Critical operations MUST have real transactions
  if (transactionCapability !== 'SUPPORTED') {
    throw new Error(
      'CRITICAL: Cannot perform financial operation without transaction support. ' +
      'MongoDB replica set is required.'
    );
  }

  // Use full Prisma transaction with ACID guarantees and increased timeout
  // Default timeout increased from 5s to 10s to prevent timeouts on slow queries
  return await prisma.$transaction(callback as any, {
    timeout: options?.timeout || 10000, // 10 seconds (was 5s default)
    maxWait: options?.maxWait || 5000, // 5 seconds to acquire connection
  }) as T;
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
 * Get current transaction capability for logging/debugging
 */
export function getTransactionCapability(): TransactionCapability {
  if (!capabilityCheckComplete) {
    return 'UNKNOWN';
  }
  return transactionCapability;
}

/**
 * Check if transactions are supported (for backward compatibility)
 * @deprecated Use getTransactionCapability() instead
 */
export function transactionsSupported(): boolean {
  return transactionCapability === 'SUPPORTED';
}