import { OrderStatus, SettlementStatus } from '@prisma/client';

/**
 * Validates whether an order can transition from its current status to a new status.
 * Ensures state machine invariants:
 * - CANCELLED is terminal (cannot transition to anything)
 * - Settled orders cannot be cancelled
 * - Orders with settlements cannot change to CANCELLED without settlement consideration
 * 
 * @param current - The current status of the order.
 * @param next - The proposed new status.
 * @param settlementStatus - The current settlement status (optional).
 * @returns true if the transition is allowed, false otherwise.
 */
export function canTransition(
  current: OrderStatus, 
  next: OrderStatus, 
  settlementStatus?: SettlementStatus
): boolean {
  if (current === next) {
    return false;
  }

  // CANCELLED is terminal - no transitions out
  if (current === OrderStatus.CANCELLED) {
    return false;
  }

  // Cannot transition TO CANCELLED if order has any settlements
  const canTransitionToCancelled = next === OrderStatus.CANCELLED && 
    (!settlementStatus || settlementStatus === 'UNSETTLED');

  switch (current) {
    case OrderStatus.SUBMITTED:
      return next === OrderStatus.IN_KITCHEN || canTransitionToCancelled || next === OrderStatus.PAID;
    case OrderStatus.IN_KITCHEN:
      return next === OrderStatus.SERVED || canTransitionToCancelled || next === OrderStatus.PAID;
    case OrderStatus.SERVED:
      return next === OrderStatus.PAID || canTransitionToCancelled;
    case OrderStatus.PAID:
      // PAID can only transition to CANCELLED if fully settled (for refunds)
      // This would require a formal refund process
      return next === OrderStatus.CANCELLED && settlementStatus === 'SETTLED';
    default:
      return false;
  }
}

/**
 * Check if an order can be settled
 */
export function canSettle(orderStatus: OrderStatus): boolean {
  // Cannot settle cancelled orders
  if (orderStatus === OrderStatus.CANCELLED) {
    return false;
  }
  
  // Can settle any non-cancelled order
  return true;
}
