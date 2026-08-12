import { OrderStatus } from '@prisma/client';
import { canTransition } from '../src/utils/orderStateMachine';

describe('orderStateMachine canTransition', () => {
  const allStates = Object.values(OrderStatus);

  // Define valid transitions
  const validTransitions: Record<OrderStatus, OrderStatus[]> = {
    [OrderStatus.SUBMITTED]: [OrderStatus.IN_KITCHEN, OrderStatus.CANCELLED, OrderStatus.PAID],
    [OrderStatus.IN_KITCHEN]: [OrderStatus.SERVED, OrderStatus.CANCELLED, OrderStatus.PAID],
    [OrderStatus.SERVED]: [OrderStatus.PAID, OrderStatus.CANCELLED],
    [OrderStatus.PAID]: [OrderStatus.CANCELLED],
    [OrderStatus.CANCELLED]: [],
  };

  allStates.forEach((currentState) => {
    describe(`From ${currentState}`, () => {
      allStates.forEach((nextState) => {
        const isValid = validTransitions[currentState].includes(nextState);

        it(`should return ${isValid} for transition to ${nextState}`, () => {
          expect(canTransition(currentState, nextState)).toBe(isValid);
        });
      });
    });
  });
});
