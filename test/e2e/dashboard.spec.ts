import { test, expect } from '@playwright/test';
import { rmSync, existsSync } from 'node:fs';
import path from 'node:path';

const TEST_DB = path.join(process.cwd(), '.vitest-cache', 'e2e-stocks.db');

test.beforeAll(() => {
  ['', '-shm', '-wal'].forEach(suffix => {
    const p = `${TEST_DB}${suffix}`;
    if (existsSync(p)) rmSync(p);
  });
});

test('user can add a holding and see it on the dashboard', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('No holdings yet')).toBeVisible();

  await page.getByRole('button', { name: '+ Add holding' }).click();
  await page.getByLabel('Ticker').fill('AAPL');
  await page.getByLabel('Qty').fill('10');
  await page.getByLabel('Price').fill('150');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByRole('link', { name: 'AAPL' })).toBeVisible({ timeout: 10_000 });

  await page.getByRole('link', { name: 'AAPL' }).click();
  await expect(page.locator('h1', { hasText: 'AAPL' })).toBeVisible({ timeout: 15_000 });
});

test('dashboard persists holdings across reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'AAPL' })).toBeVisible({ timeout: 10_000 });
});
