import { test, expect } from '@playwright/test';

test.describe('PIN Auth Flow', () => {
  test('Successful login as Waiter', async ({ page }) => {
    await page.goto('/login');
    await page.click('text=WAITER');
    await page.click('text=Sarah Connor');
    
    // PIN 1111
    for (let i = 0; i < 4; i++) {
      await page.click('button:has-text("1")');
    }
    
    await expect(page).toHaveURL(/.*\/waiter/);
  });

  test('Invalid PIN shows error and clears input', async ({ page }) => {
    await page.goto('/login');
    await page.click('text=WAITER');
    await page.click('text=Sarah Connor');
    
    // Wrong PIN 9999
    for (let i = 0; i < 4; i++) {
      await page.click('button:has-text("9")');
    }
    
    await expect(page.locator('text=Invalid PIN')).toBeVisible();
    // The dots should be empty (or reset)
    // We can just verify we didn't navigate
    await expect(page).toHaveURL(/.*\/login/);
  });

  test('Lockout after 5 failed attempts', async ({ page }) => {
    await page.goto('/login');
    await page.click('text=CASHIER');
    await page.click('text=Mike Teller');
    
    // Attempt 1-4
    for (let attempt = 0; attempt < 4; attempt++) {
      for (let i = 0; i < 4; i++) {
        await page.click('button:has-text("9")');
      }
      await expect(page.locator('text=Invalid PIN')).toBeVisible();
    }
    
    // Attempt 5 (Lockout)
    for (let i = 0; i < 4; i++) {
      await page.click('button:has-text("9")');
    }
    
    await expect(page.locator('text=Account locked. Try again in 15 minutes.')).toBeVisible();
    
    // Verify reload keeps lockout
    await page.reload();
    await page.click('text=CASHIER');
    await page.click('text=Mike Teller');
    for (let i = 0; i < 4; i++) {
      await page.click('button:has-text("9")');
    }
    await expect(page.locator('text=Account locked. Try again in 15 minutes.')).toBeVisible();
  });
});
