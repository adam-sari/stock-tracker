import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { getDb } from '@/lib/db/connection';
import { makeTestDb } from '@/test/helpers/test-db';

const testDb = makeTestDb('backtest-history-route');

function ins(date: string, ticker: string, kind: string, score: number) {
  getDb().prepare(
    `INSERT INTO backtest_scores (date, ticker, signal_kind, score, detail_json) VALUES (?, ?, ?, ?, '{}')`
  ).run(date, ticker, kind, score);
}

function today(): string {
  return (getDb().prepare(`SELECT date('now') AS d`).get() as { d: string }).d;
}

describe('GET /api/stock/[ticker]/backtest-history', () => {
  beforeEach(testDb.reset);
  afterAll(testDb.teardown);

  it('returns 200 with history rows for a known ticker', async () => {
    ins(today(), 'AAPL', 'insider', 0.5);
    const { GET } = await import('@/app/api/stock/[ticker]/backtest-history/route');
    const res = await GET(new Request('http://x'), { params: Promise.resolve({ ticker: 'AAPL' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.history).toHaveLength(1);
    expect(body.history[0].ticker).toBe('AAPL');
  });

  it('returns empty history for unknown ticker (still 200)', async () => {
    const { GET } = await import('@/app/api/stock/[ticker]/backtest-history/route');
    const res = await GET(new Request('http://x'), { params: Promise.resolve({ ticker: 'NOPE' }) });
    expect(res.status).toBe(200);
    expect((await res.json()).history).toEqual([]);
  });
});
