/**
 * Immutability Middleware
 * 
 * Enforces immutability rules for financial records at the Prisma level.
 * This provides defense-in-depth: even if a route is accidentally created,
 * the middleware prevents dangerous operations.
 * 
 * PROTECTED MODELS:
 * - CashDrawerEvent: Append-only ledger (always immutable)
 * - Settlement: Financial records (always immutable after creation)
 * - DailyClose: Immutable after status = CLOSED (conditional)
 * - Order: After settlement begins (partial protection, not yet implemented)
 */

import { logger } from '../utils/logger';

/**
 * Prisma middleware to prevent updates and deletes on immutable models
 */
export function createImmutabilityMiddleware() {
  return async (params: any, next: any) => {
    // Block ALL updates and deletes on CashDrawerEvent
    if (params.model === 'CashDrawerEvent') {
      if (params.action === 'update' || params.action === 'updateMany') {
        logger.error(
          { model: params.model, action: params.action, args: params.args },
          'SECURITY: Attempted to UPDATE immutable CashDrawerEvent'
        );
        throw new Error(
          'CashDrawerEvent records are immutable. Use CASH_ADJUSTMENT to create a compensating event.'
        );
      }

      if (params.action === 'delete' || params.action === 'deleteMany') {
        logger.error(
          { model: params.model, action: params.action, args: params.args },
          'SECURITY: Attempted to DELETE immutable CashDrawerEvent'
        );
        throw new Error(
          'CashDrawerEvent records cannot be deleted. Ledger is append-only.'
        );
      }
    }

    // Block updates and deletes on Settlement (with exceptions for system operations)
    if (params.model === 'Settlement') {
      if (params.action === 'update' || params.action === 'updateMany') {
        logger.warn(
          { model: params.model, action: params.action, args: params.args },
          'WARNING: Attempted to UPDATE Settlement record'
        );
        throw new Error(
          'Settlement records are immutable after creation. To void a settlement, create a compensating settlement.'
        );
      }

      if (params.action === 'delete' || params.action === 'deleteMany') {
        logger.error(
          { model: params.model, action: params.action, args: params.args },
          'SECURITY: Attempted to DELETE Settlement record'
        );
        throw new Error(
          'Settlement records cannot be deleted. Financial records must be permanent.'
        );
      }
    }

    // Block updates and deletes on CLOSED DailyClose records
    // Note: PENDING_REVIEW can be updated (e.g., re-running startDailyClose to fix data)
    if (params.model === 'DailyClose') {
      if (params.action === 'update' || params.action === 'updateMany') {
        // For single update, check the where clause
        const businessDate = params.args?.where?.businessDate;
        
        if (businessDate) {
          // Query the current status before allowing update
          const { PrismaClient } = await import('@prisma/client');
          const prisma = new PrismaClient();
          
          try {
            const existing = await prisma.dailyClose.findUnique({
              where: { businessDate },
              select: { status: true, businessDate: true },
            });
            
            if (existing && existing.status === 'CLOSED') {
              logger.error(
                { businessDate, status: existing.status, action: params.action },
                'SECURITY: Attempted to UPDATE CLOSED DailyClose'
              );
              throw new Error(
                `Daily close for ${businessDate} is CLOSED and cannot be modified. Financial records are immutable after finalization.`
              );
            }
          } finally {
            await prisma.$disconnect();
          }
        } else {
          // updateMany without specific businessDate - block entirely to be safe
          logger.error(
            { action: params.action, args: params.args },
            'SECURITY: Attempted updateMany on DailyClose without specific businessDate'
          );
          throw new Error(
            'Bulk updates on DailyClose are not allowed. Specify a businessDate.'
          );
        }
      }

      if (params.action === 'delete' || params.action === 'deleteMany') {
        logger.error(
          { model: params.model, action: params.action, args: params.args },
          'SECURITY: Attempted to DELETE DailyClose record'
        );
        throw new Error(
          'DailyClose records cannot be deleted. Financial records must be permanent.'
        );
      }
    }

    // Allow operation to proceed
    return next(params);
  };
}

/**
 * Helper function to check if operation would violate immutability
 * Use this for additional validation in service layer
 */
export function validateImmutability(model: string, operation: 'update' | 'delete'): void {
  const immutableModels = ['CashDrawerEvent', 'Settlement'];
  
  if (immutableModels.includes(model)) {
    logger.error(
      { model, operation },
      `SECURITY: Service layer attempted ${operation} on immutable model ${model}`
    );
    throw new Error(
      `${model} records are immutable. This operation is not allowed.`
    );
  }
}
