import { OrderStatus } from '@prisma/client';
import { canTransition } from '../src/utils/orderStateMachine';

describe('orderStateMachine canTransition', () => {
  const allStates = Object.values(OrderStatus);

  // Define valid transitions
  //
  // NOTE: the sweep calls canTransition(current, next) with no settlementStatus.
  // In that default (unsettled) form, PAID → CANCELLED is not allowed — it is
  // only permitted for the refund path when settlementStatus === 'SETTLED'
  // (see utils/orderStateMachine.ts). The map below asserts the default form.
  const validTransitions: Record<OrderStatus, OrderStatus[]> = {
    [OrderStatus.SUBMITTED]: [OrderStatus.IN_KITCHEN, OrderStatus.CANCELLED, OrderStatus.PAID],
    [OrderStatus.IN_KITCHEN]: [OrderStatus.SERVED, OrderStatus.CANCELLED, OrderStatus.PAID],
    [OrderStatus.SERVED]: [OrderStatus.PAID, OrderStatus.CANCELLED],
    [OrderStatus.PAID]: [],
    [OrderStatus.CANCELLED]: [],
  };

  it('PAID → CANCELLED is allowed only for the settled refund path', () => {
    expect(canTransition(OrderStatus.PAID, OrderStatus.CANCELLED, 'SETTLED')).toBe(true);
    expect(canTransition(OrderStatus.PAID, OrderStatus.CANCELLED, 'UNSETTLED')).toBe(false);
    expect(canTransition(OrderStatus.PAID, OrderStatus.CANCELLED)).toBe(false);
  });

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
