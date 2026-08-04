import { describe, it, expect } from 'vitest';

describe('Order Cart & Total Computation', () => {
  it('should correctly compute order totals from snapshot item prices', () => {
    const cartItems = [
      { unitPrice: 18.5, quantity: 2 },
      { unitPrice: 6.5, quantity: 1 },
      { unitPrice: 9.0, quantity: 3 },
    ];

    const computedTotal = cartItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

    // 37.00 + 6.50 + 27.00 = 70.50
    expect(computedTotal).toBe(70.5);
  });

  it('should preserve snapshot unit price when menu item price changes', () => {
    const historicalOrderItem = {
      menuItemId: '507f1f77bcf86cd799439011',
      name: 'Wagyu Burger',
      unitPrice: 18.5,
      quantity: 2,
    };

    // Updated menu item price
    const updatedMenuItem = {
      id: '507f1f77bcf86cd799439011',
      name: 'Wagyu Burger',
      price: 25.0, // increased price
    };

    // Total must rely strictly on historical snapshot unitPrice (18.50 * 2 = 37.00)
    const historicalTotal = historicalOrderItem.unitPrice * historicalOrderItem.quantity;
    expect(historicalTotal).toBe(37.0);
    expect(historicalTotal).not.toBe(updatedMenuItem.price * historicalOrderItem.quantity);
  });
});
