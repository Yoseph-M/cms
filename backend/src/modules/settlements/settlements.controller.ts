import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { recordSettlement, getOrderSettlements, getSettlementById, getRemainingAmount } from '../../services/settlement.service';
import { logger } from '../../utils/logger';

/**
 * POST /api/orders/:orderId/settlements
 * Record an external settlement for an order
 */
export async function createSettlement(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const { orderId } = req.params;
  const { amountMinor, method, reference, note } = req.body;
  const recordedById = req.user!.userId;
  
  // Extract idempotency key from header
  const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

  try {
    const result = await recordSettlement({
      orderId,
      amountMinor,
      method,
      reference,
      note,
      recordedById,
      idempotencyKey,
    });

    return res.status(201).json({
      settlement: result.settlement,
      order: result.order,
    });
  } catch (error: any) {
    logger.error({ error, orderId, recordedById }, 'Settlement recording failed');
    
    // Pass error to global error middleware for proper handling
    return next(error);
  }
}

/**
 * GET /api/orders/:orderId/settlements
 * Get all settlements for an order
 */
export async function listSettlements(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const { orderId } = req.params;

  try {
    const settlements = await getOrderSettlements(orderId);
    return res.json(settlements);
  } catch (error: any) {
    logger.error({ error, orderId }, 'Failed to fetch settlements');
    return next(error);
  }
}

/**
 * GET /api/settlements/:settlementId
 * Get a specific settlement by ID
 */
export async function getSettlement(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const { settlementId } = req.params;

  try {
    const settlement = await getSettlementById(settlementId);
    
    if (!settlement) {
      return res.status(404).json({ error: 'Settlement not found' });
    }

    return res.json(settlement);
  } catch (error: any) {
    logger.error({ error, settlementId }, 'Failed to fetch settlement');
    return next(error);
  }
}

/**
 * GET /api/orders/:orderId/remaining-amount
 * Get remaining amount to settle for an order
 */
export async function getRemaining(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const { orderId } = req.params;

  try {
    const remaining = await getRemainingAmount(orderId);
    return res.json({ orderId, remainingAmount: remaining });
  } catch (error: any) {
    logger.error({ error, orderId }, 'Failed to calculate remaining amount');
    return next(error);
  }
}
