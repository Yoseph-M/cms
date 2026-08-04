import { test, expect } from '@playwright/test';

test.describe('Orientation Layout Tests', () => {
  // Use a portrait mobile/tablet viewport
  test.use({ viewport: { width: 400, height: 800 } });

  test('Shows orientation overlay in portrait mode for non-owner', async ({ page }) => {
    // 1. Waiter logs in
    await page.goto('/login');
    await page.click('text=WAITER');
    await page.click('text=Sarah Connor');
    for (let i = 0; i < 4; i++) {
      await page.click('button:has-text("1")');
    }
    await expect(page).toHaveURL(/.*\/waiter/);

    // 2. Should see the orientation prompt because viewport is portrait
    const prompt = page.locator('text=Please rotate your device');
    await expect(prompt).toBeVisible();

    // 3. Click continue anyway
    await page.click('text=Continue Anyway');
    await expect(prompt).not.toBeVisible();
  });

  test('Does not show orientation overlay for OWNER', async ({ page }) => {
    // 1. Owner logs in
    await page.goto('/login');
    await page.click('text=OWNER');
    await page.click('text=Alice Admin'); // Adjust owner name if different in seed
    for (let i = 0; i < 4; i++) {
      await page.click('button:has-text("0")'); // Assuming 0000 for Owner
    }
    await expect(page).toHaveURL(/.*\/owner/);

    // 2. Should NOT see the orientation prompt even though viewport is portrait
    const prompt = page.locator('text=Please rotate your device');
    await expect(prompt).not.toBeVisible();
  });
});
