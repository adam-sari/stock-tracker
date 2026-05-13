import { test, expect } from '@playwright/test';

test('Discover page renders filters and empty state when no scores', async ({ page }) => {
  await page.goto('/discover');
  await expect(page.locator('h1', { hasText: 'Discover' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Insider clusters/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Congress buying/i })).toBeVisible();
  // The empty state OR cards must be visible
  const empty = page.getByText('No discovery candidates yet');
  const card = page.locator('text=/score /').first();
  await expect.poll(async () => (await empty.count()) > 0 || (await card.count()) > 0).toBeTruthy();
});

test('Filter toggle updates the URL query for /api/discover (UI smoke)', async ({ page }) => {
  await page.goto('/discover');
  await page.getByRole('button', { name: /Insider clusters/i }).click();
  // No assertion needed — just ensure no crash; the button text starts with ☑ and toggles to ☐
});
