import { test, expect } from '@playwright/test';
import { rmSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const TEST_DB = path.join(process.cwd(), '.vitest-cache', 'e2e-stocks.db');

test.beforeAll(() => {
  // See dashboard.spec.ts for rationale on re-applying schema after delete.
  ['', '-shm', '-wal'].forEach(suffix => {
    const p = `${TEST_DB}${suffix}`;
    if (existsSync(p)) rmSync(p);
  });
  execSync('npm run db:init', { env: { ...process.env, DB_PATH: TEST_DB }, stdio: 'pipe' });
});

test('stock detail page renders header, chart, and tabs', async ({ page }) => {
  // Add a holding via API (server boots its own DB at TEST_DB)
  await page.request.post('/api/transactions', {
    data: { ticker: 'AAPL', kind: 'buy', qty: 10, price: 150, executed_at: '2026-01-01T14:30:00Z' },
    headers: { 'content-type': 'application/json' },
  });

  await page.goto('/stock/AAPL');
  await expect(page.locator('h1', { hasText: 'AAPL' })).toBeVisible({ timeout: 15_000 });

  // Tab strip
  await expect(page.getByRole('button', { name: 'Activity' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'News' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Insiders' })).toBeVisible();

  // Click News tab — should fetch + render (possibly empty state)
  await page.getByRole('button', { name: 'News' }).click();
  await expect(page.locator('text=/No news fetched|.+\\.com/').first()).toBeVisible({ timeout: 8_000 });

  // Click About — meta panel shows
  await page.getByRole('button', { name: 'About' }).click();
  await expect(page.locator('text=/Sector|Company metadata not yet available/').first()).toBeVisible();
});
