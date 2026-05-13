import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';
import { createTransaction } from '@/lib/db/queries/transactions';
import { refreshEarningsOnce } from '@/lib/jobs/refresh-earnings';
import { refreshRecommendationsOnce } from '@/lib/jobs/refresh-recommendations';
import { refreshInsiderSentimentOnce } from '@/lib/jobs/refresh-insider-sentiment';
import { FinnhubClient } from '@/lib/providers/finnhub';

const TEST_DB_DIR = path.join(process.cwd(), '.vitest-cache', 'refresh-trio');
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test.db');

describe('Finnhub-driven trio of jobs', () => {
  beforeEach(() => {
    closeDb();
    if (existsSync(TEST_DB_DIR)) rmSync(TEST_DB_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DB_DIR, { recursive: true });
    process.env.DB_PATH = TEST_DB_PATH;
    applySchema(getDb());
    createTransaction({ ticker: 'AAPL', kind: 'buy', qty: 10, price: 150, executed_at: '2026-01-01T14:30:00Z' });
  });
  afterAll(() => { closeDb(); rmSync(TEST_DB_DIR, { recursive: true, force: true }); });

  it('refreshEarningsOnce stores earnings for held tickers only', async () => {
    const fh = new FinnhubClient({ apiKey: 'k' });
    vi.spyOn(fh, 'getEarningsCalendar').mockResolvedValue([
      { symbol: 'AAPL', date: '2026-05-20', hour: 'amc', epsActual: null, epsEstimate: 1.5, revenueActual: null, revenueEstimate: 90_000_000, quarter: 3, year: 2026 },
      { symbol: 'MSFT', date: '2026-05-21', hour: 'amc', epsActual: null, epsEstimate: 2.0, revenueActual: null, revenueEstimate: 100_000_000, quarter: 3, year: 2026 },
    ]);
    const r = await refreshEarningsOnce(fh);
    expect(r.inserted).toBe(1);
    const row = getDb().prepare(`SELECT * FROM earnings_calendar WHERE ticker='AAPL'`).get() as { eps_estimate: number };
    expect(row.eps_estimate).toBe(1.5);
  });

  it('refreshRecommendationsOnce stores analyst recs', async () => {
    const fh = new FinnhubClient({ apiKey: 'k' });
    vi.spyOn(fh, 'getRecommendation').mockResolvedValue([
      { ticker: 'AAPL', period: '2026-05-01', strongBuy: 15, buy: 24, hold: 13, sell: 2, strongSell: 0 },
    ]);
    const r = await refreshRecommendationsOnce(fh);
    expect(r.updated).toBe(1);
    const row = getDb().prepare(`SELECT * FROM analyst_recommendations WHERE ticker='AAPL'`).get() as { strong_buy: number };
    expect(row.strong_buy).toBe(15);
  });

  it('refreshInsiderSentimentOnce stores monthly MSPR', async () => {
    const fh = new FinnhubClient({ apiKey: 'k' });
    vi.spyOn(fh, 'getInsiderSentiment').mockResolvedValue([
      { ticker: 'AAPL', year: 2026, month: 2, change: 6732, mspr: 25.65 },
    ]);
    const r = await refreshInsiderSentimentOnce(fh);
    expect(r.months).toBe(1);
    const row = getDb().prepare(`SELECT * FROM insider_sentiment_monthly WHERE ticker='AAPL' AND month=2`).get() as { mspr: number };
    expect(row.mspr).toBe(25.65);
  });
});
