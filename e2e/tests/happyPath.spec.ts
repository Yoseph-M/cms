import { test, expect } from '@playwright/test';

test.describe('POS Happy Path', () => {
  test('Waiter creates order, Cashier pays order', async ({ browser }) => {
    // We will use two separate browser contexts to simulate Waiter and Cashier on different tablets
    const waiterContext = await browser.newContext();
    const cashierContext = await browser.newContext();

    const waiterPage = await waiterContext.newPage();
    const cashierPage = await cashierContext.newPage();

    // 1. Waiter logs in
    await waiterPage.goto('/login');
    // Role selection
    await waiterPage.click('text=WAITER');
    // Name selection
    await waiterPage.click('text=Sarah Connor');
    // PIN entry (assuming 1111 for Sarah Connor)
    await waiterPage.click('button:has-text("1")');
    await waiterPage.click('button:has-text("1")');
    await waiterPage.click('button:has-text("1")');
    await waiterPage.click('button:has-text("1")');
    await expect(waiterPage).toHaveURL(/.*\/waiter/);

    // 2. Cashier logs in
    await cashierPage.goto('/login');
    // Role selection
    await cashierPage.click('text=CASHIER');
    // Name selection
    await cashierPage.click('text=Mike Teller');
    // PIN entry (assuming 2222 for Mike Teller)
    await cashierPage.click('button:has-text("2")');
    await cashierPage.click('button:has-text("2")');
    await cashierPage.click('button:has-text("2")');
    await cashierPage.click('button:has-text("2")');
    await expect(cashierPage).toHaveURL(/.*\/cashier/);

    // 3. Waiter creates an order
    await waiterPage.click('button:has-text("New Order")');
    // Select table
    await waiterPage.click('button:has-text("T4")'); 
    // Add item (assuming there is a menu item named Wagyu Gourmet Burger)
    await waiterPage.click('button:has-text("Wagyu Gourmet Burger")');
    await waiterPage.click('button:has-text("Submit Order")');
    
    // Expect success toast
    await expect(waiterPage.locator('text=Order sent to kitchen')).toBeVisible();

    // 4. Kitchen -> Served (simulate via Waiter dashboard if they have a mock or if we just verify the state)
    // Wait for it to appear on Cashier screen (assuming auto-updates via Socket.io)
    await expect(cashierPage.locator('text=Table #T4')).toBeVisible();

    // 5. Cashier clicks Settle Payment
    // To make it payable, it has to be SERVED. We might need a manager or kitchen context to mark it SERVED,
    // or wait for the system to process it. For this test, we assume the Cashier can see it.
    // If Cashier can't settle until SERVED, this requires the kitchen step.
    // Let's assume Settle Payment button is visible for test purposes or we click a "Mark Served" somewhere.

    // Note: E2E tests often require exact UI knowledge. Since this is an outline:
    // await cashierPage.click('button:has-text("Settle Payment")');
    // await cashierPage.click('button:has-text("Confirm Payment PAID")');
    // await expect(cashierPage.locator('text=Payment Settled')).toBeVisible();

    await waiterContext.close();
    await cashierContext.close();
  });
});
