import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';
import { createTransaction } from '@/lib/db/queries/transactions';
import { upsertCandlesDaily, upsertCandles1m } from '@/lib/db/queries/candles';
import type { Bar } from '@/lib/providers/types';

// Mock the provider chain so no network calls are made
vi.mock('@/lib/providers', () => ({
  dailyBarsChain: () => ({
    getDailyBars: async () => [],
  }),
  minuteBarsChain: () => ({
    getMinuteBars: async () => [],
  }),
}));

const TEST_DB_DIR = path.join(process.cwd(), '.vitest-cache', 'api-portfolio-series');
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test.db');

function makeBar(ticker: string, ts: number, close: number): Bar {
  const date = new Date(ts * 1000).toISOString().slice(0, 10);
  return { ticker, ts, open: close, high: close, low: close, close, volume: 1000, session: 'regular' };
}

describe('GET /api/portfolio/value-series', () => {
  beforeEach(() => {
    closeDb();
    if (existsSync(TEST_DB_DIR)) rmSync(TEST_DB_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DB_DIR, { recursive: true });
    process.env.DB_PATH = TEST_DB_PATH;
    applySchema(getDb());
  });

  afterAll(() => {
    closeDb();
    rmSync(TEST_DB_DIR, { recursive: true, force: true });
  });

  it('returns [] when no transactions', async () => {
    const { GET } = await import('@/app/api/portfolio/value-series/route');
    const res = await GET(new Request('http://localhost/api/portfolio/value-series?range=1y'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual([]);
  });

  it('returns value series with correct shape and values', async () => {
    // Insert a buy transaction before the candle date
    createTransaction({
      ticker: 'AAPL',
      kind: 'buy',
      qty: 10,
      price: 100,
      executed_at: '2024-01-01T00:00:00Z',
    });

    // Insert daily candles for AAPL for 2024-01-02
    const ts1 = Math.floor(new Date('2024-01-02T00:00:00Z').getTime() / 1000);
    const ts2 = Math.floor(new Date('2024-01-03T00:00:00Z').getTime() / 1000);
    upsertCandlesDaily([makeBar('AAPL', ts1, 150), makeBar('AAPL', ts2, 160)], 'test');

    const { GET } = await import('@/app/api/portfolio/value-series/route');
    const res = await GET(new Request('http://localhost/api/portfolio/value-series?range=all'));
    expect(res.status).toBe(200);
    const data: Array<{ ts: number; value: number; cost_basis: number }> = await res.json();

    // Should have points covering at least the two candle dates
    expect(data.length).toBeGreaterThanOrEqual(2);

    const p1 = data.find(p => p.ts === ts1);
    const p2 = data.find(p => p.ts === ts2);
    expect(p1).toBeDefined();
    expect(p2).toBeDefined();
    expect(p1!.value).toBeCloseTo(10 * 150, 4);
    expect(p2!.value).toBeCloseTo(10 * 160, 4);
    expect(p1!.cost_basis).toBeCloseTo(10 * 100, 4);

    // Each point should have the required fields
    for (const pt of data) {
      expect(typeof pt.ts).toBe('number');
      expect(typeof pt.value).toBe('number');
      expect(typeof pt.cost_basis).toBe('number');
    }
  });

  it('handles two holdings correctly', async () => {
    createTransaction({ ticker: 'AAPL', kind: 'buy', qty: 5, price: 100, executed_at: '2024-01-01T00:00:00Z' });
    createTransaction({ ticker: 'NVDA', kind: 'buy', qty: 2, price: 200, executed_at: '2024-01-01T00:00:00Z' });

    const ts = Math.floor(new Date('2024-01-02T00:00:00Z').getTime() / 1000);
    upsertCandlesDaily([
      makeBar('AAPL', ts, 110),
      makeBar('NVDA', ts, 210),
    ], 'test');

    const { GET } = await import('@/app/api/portfolio/value-series/route');
    const res = await GET(new Request('http://localhost/api/portfolio/value-series?range=all'));
    const data: Array<{ ts: number; value: number; cost_basis: number }> = await res.json();

    const pt = data.find(p => p.ts === ts);
    expect(pt).toBeDefined();
    expect(pt!.value).toBeCloseTo(5 * 110 + 2 * 210, 4);
    expect(pt!.cost_basis).toBeCloseTo(5 * 100 + 2 * 200, 4);
  });

  it('uses 1m candles for short ranges', async () => {
    createTransaction({ ticker: 'AAPL', kind: 'buy', qty: 10, price: 100, executed_at: '2020-01-01T00:00:00Z' });

    // Insert 1m candle near now so it falls in the 1d range
    const nowTs = Math.floor(Date.now() / 1000);
    const barTs = nowTs - 600; // 10 minutes ago
    upsertCandles1m([{ ticker: 'AAPL', ts: barTs, open: 150, high: 155, low: 148, close: 152, volume: 500, session: 'regular' }], 'test');

    const { GET } = await import('@/app/api/portfolio/value-series/route');
    const res = await GET(new Request('http://localhost/api/portfolio/value-series?range=1d'));
    const data: Array<{ ts: number; value: number; cost_basis: number }> = await res.json();

    const pt = data.find(p => p.ts === barTs);
    expect(pt).toBeDefined();
    expect(pt!.value).toBeCloseTo(10 * 152, 4);
  });
});
