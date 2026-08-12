import { OrderStatus } from '@prisma/client';

/**
 * Validates whether an order can transition from its current status to a new status.
 * Ensures state machine invariants (e.g., PAID and CANCELLED are terminal).
 * 
 * @param current - The current status of the order.
 * @param next - The proposed new status.
 * @returns true if the transition is allowed, false otherwise.
 */
export function canTransition(current: OrderStatus, next: OrderStatus): boolean {
  if (current === next) {
    return false;
  }

  switch (current) {
    case OrderStatus.SUBMITTED:
      return next === OrderStatus.IN_KITCHEN || next === OrderStatus.CANCELLED || next === OrderStatus.PAID;
    case OrderStatus.IN_KITCHEN:
      return next === OrderStatus.SERVED || next === OrderStatus.CANCELLED || next === OrderStatus.PAID;
    case OrderStatus.SERVED:
      return next === OrderStatus.PAID || next === OrderStatus.CANCELLED;
    case OrderStatus.PAID:
      return next === OrderStatus.CANCELLED; // Allow cancellation for refunds
    case OrderStatus.CANCELLED:
      return false; // Terminal
    default:
      return false;
  }
}
