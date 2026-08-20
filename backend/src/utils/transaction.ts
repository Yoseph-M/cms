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
 * Automatically retries on transient errors (network issues, connection drops).
 * 
 * @param prisma - Prisma client instance
 * @param callback - Function containing operations to execute
 * @param options - Transaction options (timeout, isolation level, maxRetries)
 * @returns Result from callback
 * @throws Error if transactions are not supported or max retries exceeded
 */
export async function executeInCriticalTransaction<T>(
  prisma: PrismaClient,
  callback: (tx: PrismaClient) => Promise<T>,
  options?: { timeout?: number; maxWait?: number; maxRetries?: number }
): Promise<T> {
  // Ensure we've detected transaction support
  if (!capabilityCheckComplete) {
    await detectTransactionSupport(prisma);
  }

  // Critical operations MUST have real transactions in production
  if (transactionCapability !== 'SUPPORTED') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'CRITICAL: Cannot perform financial operation without transaction support. ' +
        'MongoDB replica set is required.'
      );
    } else {
      logger.warn('Executing CRITICAL operation without transaction (standalone mode fallback)');
      return await callback(prisma);
    }
  }

  const maxRetries = options?.maxRetries ?? 3;
  const timeout = options?.timeout || 10000; // 10 seconds
  const maxWait = options?.maxWait || 5000; // 5 seconds to acquire connection
  
  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Use full Prisma transaction with ACID guarantees and increased timeout
      // Default timeout increased from 5s to 10s to prevent timeouts on slow queries
      return await prisma.$transaction(callback as any, {
        timeout,
        maxWait,
      }) as T;
    } catch (error: any) {
      lastError = error;
      
      // Check if this is a transient error that can be retried
      const isTransientError = 
        error.message?.includes('TransientTransactionError') ||
        error.message?.includes('peer closed connection') ||
        error.message?.includes('connection') ||
        error.message?.includes('network') ||
        error.message?.includes('timeout') ||
        error.code === 'P2024' || // Timed out fetching a new connection from the connection pool
        error.code === 'P1001' || // Can't reach database server
        error.code === 'P1002';   // Database server timed out
      
      if (isTransientError && attempt < maxRetries) {
        const backoffMs = Math.min(1000 * Math.pow(2, attempt), 5000); // Exponential backoff, max 5s
        logger.warn(
          { attempt: attempt + 1, maxRetries: maxRetries + 1, backoffMs, error: error.message },
          'Transient database error detected, retrying transaction'
        );
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        continue;
      }
      
      // Not a transient error, or max retries exceeded
      if (attempt >= maxRetries) {
        logger.error(
          { attempts: attempt + 1, error: error.message },
          'Transaction failed after max retries'
        );
      }
      
      throw error;
    }
  }
  
  // Should never reach here, but TypeScript needs this
  throw lastError || new Error('Transaction failed for unknown reason');
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