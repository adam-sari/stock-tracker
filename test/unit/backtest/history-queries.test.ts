import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { getDb } from '@/lib/db/connection';
import { makeTestDb } from '@/test/helpers/test-db';
import { getBacktestHistoryForTicker } from '@/lib/db/queries/backtest-history';

const testDb = makeTestDb('backtest-history-queries');

function ins(date: string, ticker: string, kind: string, score: number) {
  getDb().prepare(
    `INSERT INTO backtest_scores (date, ticker, signal_kind, score, detail_json) VALUES (?, ?, ?, ?, '{}')`
  ).run(date, ticker, kind, score);
}

function today(): string {
  return (getDb().prepare(`SELECT date('now') AS d`).get() as { d: string }).d;
}

describe('getBacktestHistoryForTicker', () => {
  beforeEach(testDb.reset);
  afterAll(testDb.teardown);

  it('returns ordered rows for one ticker only', () => {
    const d = today();
    const yesterday = (getDb().prepare(`SELECT date('now', '-1 day') AS d`).get() as { d: string }).d;
    ins(yesterday, 'AAPL', 'insider', 0.4);
    ins(d, 'AAPL', 'volume', 0.6);
    ins(d, 'NVDA', 'insider', 0.9);
    const rows = getBacktestHistoryForTicker(getDb(), 'AAPL', 30);
    expect(rows).toHaveLength(2);
    expect(rows[0].date).toBe(d);
    expect(rows.find(r => r.ticker === 'NVDA')).toBeUndefined();
  });

  it('respects the lookback window', () => {
    ins('2020-01-01', 'AAPL', 'insider', 0.5);
    expect(getBacktestHistoryForTicker(getDb(), 'AAPL', 30)).toHaveLength(0);
  });

  it('returns empty array for unknown ticker', () => {
    const d = today();
    ins(d, 'AAPL', 'insider', 0.4);
    expect(getBacktestHistoryForTicker(getDb(), 'NOPE', 30)).toEqual([]);
  });
});
