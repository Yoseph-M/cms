import { test, expect } from '@playwright/test';

test.describe('Concurrency & Idempotency', () => {
  test('Prevents double-payment via rapid clicks', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'cashier@pos.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button:has-text("Sign In")');

    // Assuming there's a mocked order ready for payment in the DB
    // We would intercept the network request to delay the response
    await page.route('**/api/orders/*/pay', async (route) => {
      // Add a slight delay to the first request to allow the second click
      await new Promise(resolve => setTimeout(resolve, 200));
      route.continue();
    });

    // Wait for orders to load
    // Click Settle Payment
    // Double click the Confirm button rapidly
    // Expect only one success toast and one error/conflict or just smooth handling
  });
});
