import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';
import { createTransaction } from '@/lib/db/queries/transactions';
import { getStockMeta } from '@/lib/db/queries/stock-meta';
import { refreshStockMetaOnce } from '@/lib/jobs/refresh-stock-meta';
import { FinnhubClient } from '@/lib/providers/finnhub';
import { FmpClient } from '@/lib/providers/fmp';

const TEST_DB_DIR = path.join(process.cwd(), '.vitest-cache', 'refresh-stock-meta');
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test.db');

describe('refreshStockMetaOnce', () => {
  beforeEach(() => {
    closeDb();
    if (existsSync(TEST_DB_DIR)) rmSync(TEST_DB_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DB_DIR, { recursive: true });
    process.env.DB_PATH = TEST_DB_PATH;
    applySchema(getDb());
  });
  afterAll(() => { closeDb(); rmSync(TEST_DB_DIR, { recursive: true, force: true }); });

  it('merges FMP + Finnhub into stock_meta', async () => {
    createTransaction({ ticker: 'AAPL', kind: 'buy', qty: 10, price: 150, executed_at: '2026-01-01T14:30:00Z' });
    const fmp = new FmpClient({ apiKey: 'k' });
    const finnhub = new FinnhubClient({ apiKey: 'k' });
    vi.spyOn(fmp, 'getProfile').mockResolvedValue({
      ticker: 'AAPL', name: 'Apple Inc.', description: 'Apple designs phones.', sector: 'Technology', ceo: 'Tim Cook', employees: 164000,
    });
    vi.spyOn(finnhub, 'getProfile').mockResolvedValue({
      ticker: 'AAPL', name: 'Apple Inc.', industry: 'Consumer Electronics', logoUrl: 'https://x/logo.png', marketCapMillions: 4_329_000, sharesOutstanding: 14681,
    });

    await refreshStockMetaOnce(fmp, finnhub);

    const m = getStockMeta('AAPL');
    expect(m!.description).toContain('Apple');
    expect(m!.ceo).toBe('Tim Cook');
    expect(m!.industry).toBe('Consumer Electronics');
    expect(m!.logo_url).toContain('logo.png');
    // Finnhub returns market cap in millions; we normalise to full USD on ingest
    // so display formatting is consistent across providers. 4_329 (millions) → 4.329T USD.
    expect(m!.market_cap).toBe(4_329_000_000_000);
  });
});
