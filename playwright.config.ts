import { defineConfig } from '@playwright/test';
import path from 'node:path';

const TEST_DB = path.join(process.cwd(), '.vitest-cache', 'e2e-stocks.db');

export default defineConfig({
  testDir: './test/e2e',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:3001',
    headless: true,
  },
  webServer: {
    command: 'npm run db:init && npm run dev -- -p 3001',
    url: 'http://localhost:3001',
    timeout: 60_000,
    reuseExistingServer: !process.env.CI,
    env: {
      DB_PATH: TEST_DB,
      ALPACA_KEY_ID: process.env.ALPACA_KEY_ID ?? 'test',
      ALPACA_SECRET_KEY: process.env.ALPACA_SECRET_KEY ?? 'test',
      FINNHUB_API_KEY: process.env.FINNHUB_API_KEY ?? 'test',
      FMP_API_KEY: process.env.FMP_API_KEY ?? 'test',
    },
  },
});
