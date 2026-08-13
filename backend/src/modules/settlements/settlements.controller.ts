import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { recordSettlement, getOrderSettlements, getSettlementById, getRemainingAmount } from '../../services/settlement.service';
import { logger } from '../../utils/logger';

/**
 * POST /api/orders/:orderId/settlements
 * Record an external settlement for an order
 */
export async function createSettlement(req: AuthenticatedRequest, res: Response) {
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

    // Handle specific error cases
    if (error.message.includes('SETTLEMENT_CONFLICT')) {
      return res.status(409).json({ 
        error: 'Concurrent modification detected. Please refresh and try again.',
        code: 'SETTLEMENT_CONFLICT',
      });
    }

    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }

    if (error.message.includes('cancelled') || 
        error.message.includes('exceed') || 
        error.message.includes('must be greater')) {
      return res.status(400).json({ error: error.message });
    }

    // Generic error
    return res.status(500).json({ error: 'Failed to record settlement' });
  }
}

/**
 * GET /api/orders/:orderId/settlements
 * Get all settlements for an order
 */
export async function listSettlements(req: AuthenticatedRequest, res: Response) {
  const { orderId } = req.params;

  try {
    const settlements = await getOrderSettlements(orderId);
    return res.json(settlements);
  } catch (error: any) {
    logger.error({ error, orderId }, 'Failed to fetch settlements');
    return res.status(500).json({ error: 'Failed to fetch settlements' });
  }
}

/**
 * GET /api/settlements/:settlementId
 * Get a specific settlement by ID
 */
export async function getSettlement(req: AuthenticatedRequest, res: Response) {
  const { settlementId } = req.params;

  try {
    const settlement = await getSettlementById(settlementId);
    
    if (!settlement) {
      return res.status(404).json({ error: 'Settlement not found' });
    }

    return res.json(settlement);
  } catch (error: any) {
    logger.error({ error, settlementId }, 'Failed to fetch settlement');
    return res.status(500).json({ error: 'Failed to fetch settlement' });
  }
}

/**
 * GET /api/orders/:orderId/remaining-amount
 * Get remaining amount to settle for an order
 */
export async function getRemaining(req: AuthenticatedRequest, res: Response) {
  const { orderId } = req.params;

  try {
    const remaining = await getRemainingAmount(orderId);
    return res.json({ orderId, remainingAmount: remaining });
  } catch (error: any) {
    logger.error({ error, orderId }, 'Failed to calculate remaining amount');
    
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }

    return res.status(500).json({ error: 'Failed to calculate remaining amount' });
  }
}
