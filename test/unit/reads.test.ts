import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';
import { upsertNews } from '@/lib/db/queries/news';
import { upsertInsiderTxns } from '@/lib/db/queries/insider';
import {
  listNewsForTicker, listInsidersForTicker, listFundsForTicker, listCongressForTicker,
  listSentimentForTicker, listEarningsForTicker, listRecommendationsForTicker,
} from '@/lib/db/queries/reads';

const TEST_DB_DIR = path.join(process.cwd(), '.vitest-cache', 'reads');
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test.db');

describe('list-for-ticker queries', () => {
  beforeEach(() => {
    closeDb();
    if (existsSync(TEST_DB_DIR)) rmSync(TEST_DB_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DB_DIR, { recursive: true });
    process.env.DB_PATH = TEST_DB_PATH;
    applySchema(getDb());
  });
  afterAll(() => { closeDb(); rmSync(TEST_DB_DIR, { recursive: true, force: true }); });

  it('listNewsForTicker orders by published_at DESC', () => {
    upsertNews([
      { id: 'a', ticker: 'AAPL', headline: 'older', url: 'https://x/a', source: 'finnhub', published_at: 100, fetched_at: 200 },
      { id: 'b', ticker: 'AAPL', headline: 'newer', url: 'https://x/b', source: 'finnhub', published_at: 200, fetched_at: 300 },
    ]);
    const out = listNewsForTicker('AAPL');
    expect(out.length).toBe(2);
    expect(out[0].headline).toBe('newer');
  });

  it('listInsidersForTicker orders by txn_date DESC', () => {
    upsertInsiderTxns([
      { id: '1', ticker: 'AAPL', insider_name: 'A', code: 'P', is_derivative: 0, shares: 100, txn_date: '2026-01-01', filed_at: 100, source: 'edgar' },
      { id: '2', ticker: 'AAPL', insider_name: 'B', code: 'S', is_derivative: 0, shares: 50, txn_date: '2026-02-01', filed_at: 200, source: 'edgar' },
    ]);
    const out = listInsidersForTicker('AAPL');
    expect(out[0].insider_name).toBe('B');
    expect(out[1].insider_name).toBe('A');
  });

  it('listFundsForTicker joins funds table for fund_name', () => {
    getDb().prepare(`INSERT INTO funds (cik, name, is_curated) VALUES ('0001067983', 'Berkshire Hathaway', 1)`).run();
    getDb().prepare(`
      INSERT INTO fund_holdings (filing_accession, cik, ticker, shares, value_usd, period_end, filed_at)
      VALUES ('acc1', '0001067983', 'AAPL', 1000000, 290000000, '2026-03-31', 1700000000)
    `).run();
    const out = listFundsForTicker('AAPL');
    expect(out.length).toBe(1);
    expect(out[0].fund_name).toBe('Berkshire Hathaway');
    expect(out[0].shares).toBe(1000000);
  });

  it('returns [] for ticker with no data', () => {
    expect(listCongressForTicker('UNKNOWN').length).toBe(0);
    expect(listSentimentForTicker('UNKNOWN').length).toBe(0);
    expect(listEarningsForTicker('UNKNOWN').length).toBe(0);
    expect(listRecommendationsForTicker('UNKNOWN').length).toBe(0);
  });
});
