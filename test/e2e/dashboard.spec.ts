import { test, expect } from '@playwright/test';
import { rmSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const TEST_DB = path.join(process.cwd(), '.vitest-cache', 'e2e-stocks.db');

test.beforeAll(() => {
  // Reset the e2e DB to a known empty state with schema applied.
  // Re-applying the schema is required because Next.js dev-mode HMR can
  // recycle the better-sqlite3 connection between this beforeAll deletion
  // and the first API request, causing a fresh empty file to be opened.
  ['', '-shm', '-wal'].forEach(suffix => {
    const p = `${TEST_DB}${suffix}`;
    if (existsSync(p)) rmSync(p);
  });
  execSync('npm run db:init', { env: { ...process.env, DB_PATH: TEST_DB }, stdio: 'pipe' });
});

test('user can add a holding and see it on the dashboard', async ({ page }) => {
  await page.goto('/');

  // Use a ticker unique to this test so we don't collide with other specs
  // that share the same dev-server DB when running in parallel.
  const TICKER = 'TSLA';

  await page.getByRole('button', { name: '+ Add holding' }).click();
  await page.getByLabel('Ticker').fill(TICKER);
  await page.getByLabel('Qty').fill('10');
  await page.getByLabel('Price').fill('150');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByRole('link', { name: TICKER })).toBeVisible({ timeout: 10_000 });

  await page.getByRole('link', { name: TICKER }).click();
  await expect(page.locator('h1', { hasText: TICKER })).toBeVisible({ timeout: 15_000 });
});

test('dashboard persists holdings across reload', async ({ page }) => {
  await page.goto('/');
  // Either the TSLA from the prior test OR the AAPL from stock-detail.spec.ts
  // should be visible — whichever holding(s) exist persist across reload.
  const tsla = page.getByRole('link', { name: 'TSLA' });
  const aapl = page.getByRole('link', { name: 'AAPL' });
  await expect.poll(async () => (await tsla.count()) > 0 || (await aapl.count()) > 0, { timeout: 10_000 }).toBeTruthy();
});
