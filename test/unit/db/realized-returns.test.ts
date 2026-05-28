import { describe, it, expect, beforeEach } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';
import {
  getRealizedReturn,
  insertRealizedReturns,
  listMissingReturnsForBacktestScores,
  listIncompleteReturnsToRetry,
  type RealizedReturnRow,
} from '@/lib/db/queries/realized-returns';

const DIR = path.join(process.cwd(), '.vitest-cache', 'realized-returns-queries');
const DB_PATH = path.join(DIR, 'test.db');

function reset() {
  closeDb();
  if (existsSync(DIR)) rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
  process.env.DB_PATH = DB_PATH;
  applySchema(getDb());
}

function seedCandle(ticker: string, date: string, close: number) {
  getDb().prepare(
    `INSERT INTO candles_daily (ticker, date, open, high, low, close, volume, source)
     VALUES (?, ?, ?, ?, ?, ?, 0, 'test')`
  ).run(ticker, date, close, close, close, close);
}

function seedScore(date: string, ticker: string, kind: string, score: number) {
  getDb().prepare(
    `INSERT INTO backtest_scores (date, ticker, signal_kind, score, detail_json)
     VALUES (?, ?, ?, ?, '{}')`
  ).run(date, ticker, kind, score);
}

function makeRow(date: string, ticker: string, horizon: number, status: RealizedReturnRow['status'], return_pct: number | null = null, spy_excess_pct: number | null = null): RealizedReturnRow {
  return { date, ticker, horizon_days: horizon, return_pct, spy_excess_pct, status, computed_at: 0 };
}

describe('getRealizedReturn', () => {
  beforeEach(reset);

  it('returns null when no row exists', () => {
    expect(getRealizedReturn(getDb(), '2024-01-02', 'AAPL', 5)).toBeNull();
  });

  it('returns the row when it exists', () => {
    insertRealizedReturns(getDb(), [makeRow('2024-01-02', 'AAPL', 5, 'computed', 0.123, 0.045)]);
    const row = getRealizedReturn(getDb(), '2024-01-02', 'AAPL', 5);
    expect(row).not.toBeNull();
    expect(row!.return_pct).toBeCloseTo(0.123, 6);
    expect(row!.spy_excess_pct).toBeCloseTo(0.045, 6);
    expect(row!.status).toBe('computed');
  });
});

describe('insertRealizedReturns', () => {
  beforeEach(reset);

  it('is idempotent: re-running with same rows produces same row count', () => {
    const rows = [
      makeRow('2024-01-02', 'AAPL', 1, 'computed', 0.01, 0.01),
      makeRow('2024-01-02', 'NVDA', 1, 'computed', 0.02, 0.02),
    ];
    insertRealizedReturns(getDb(), rows);
    insertRealizedReturns(getDb(), rows);
    const count = getDb().prepare(`SELECT COUNT(*) AS n FROM realized_returns`).get() as { n: number };
    expect(count.n).toBe(2);
  });

  it('uses INSERT OR REPLACE semantics: a second insert updates the row', () => {
    insertRealizedReturns(getDb(), [makeRow('2024-01-02', 'AAPL', 1, 'pending', null, null)]);
    insertRealizedReturns(getDb(), [makeRow('2024-01-02', 'AAPL', 1, 'computed', 0.5, 0.3)]);
    const row = getRealizedReturn(getDb(), '2024-01-02', 'AAPL', 1);
    expect(row!.status).toBe('computed');
    expect(row!.return_pct).toBeCloseTo(0.5, 6);
  });
});

describe('listMissingReturnsForBacktestScores', () => {
  beforeEach(reset);

  it('returns (date, ticker, horizon) tuples for backtest_scores not in realized_returns', () => {
    seedCandle('AAPL', '2024-01-02', 100);
    seedCandle('NVDA', '2024-01-02', 200);
    seedScore('2024-01-02', 'AAPL', 'insider', 0.8);
    seedScore('2024-01-02', 'NVDA', 'insider', 0.9);
    const missing = listMissingReturnsForBacktestScores(getDb(), [1, 5]);
    expect(missing).toHaveLength(4);
    expect(missing).toContainEqual({ date: '2024-01-02', ticker: 'AAPL', horizon: 1 });
    expect(missing).toContainEqual({ date: '2024-01-02', ticker: 'NVDA', horizon: 5 });
  });

  it('filters out weekend backtest_scores rows (no candle on that date)', () => {
    seedCandle('AAPL', '2024-01-02', 100);
    seedScore('2024-01-02', 'AAPL', 'insider', 0.8);
    seedScore('2024-01-06', 'AAPL', 'insider', 0.8);
    const missing = listMissingReturnsForBacktestScores(getDb(), [1]);
    expect(missing).toHaveLength(1);
    expect(missing[0].date).toBe('2024-01-02');
  });

  it('excludes (date, ticker, horizon) tuples already in realized_returns', () => {
    seedCandle('AAPL', '2024-01-02', 100);
    seedScore('2024-01-02', 'AAPL', 'insider', 0.8);
    insertRealizedReturns(getDb(), [makeRow('2024-01-02', 'AAPL', 1, 'computed', 0.1, 0.05)]);
    const missing = listMissingReturnsForBacktestScores(getDb(), [1, 5]);
    expect(missing).toHaveLength(1);
    expect(missing[0]).toEqual({ date: '2024-01-02', ticker: 'AAPL', horizon: 5 });
  });

  it('accepts dynamic horizons (no hard-coded list)', () => {
    seedCandle('AAPL', '2024-01-02', 100);
    seedScore('2024-01-02', 'AAPL', 'insider', 0.8);
    expect(listMissingReturnsForBacktestScores(getDb(), [5])).toHaveLength(1);
    expect(listMissingReturnsForBacktestScores(getDb(), [1, 5, 21])).toHaveLength(3);
  });
});

describe('listIncompleteReturnsToRetry', () => {
  beforeEach(reset);

  it('returns pending rows whose horizon has now passed', () => {
    seedCandle('AAPL', '2024-01-02', 100);
    seedCandle('AAPL', '2024-01-04', 110);
    insertRealizedReturns(getDb(), [makeRow('2024-01-02', 'AAPL', 1, 'pending', null, null)]);
    const retry = listIncompleteReturnsToRetry(getDb(), [1, 5]);
    expect(retry).toHaveLength(1);
    expect(retry[0]).toEqual({ date: '2024-01-02', ticker: 'AAPL', horizon: 1 });
  });

  it('does not return pending rows whose horizon is still in the future', () => {
    seedCandle('AAPL', '2024-01-02', 100);
    insertRealizedReturns(getDb(), [makeRow('2024-01-02', 'AAPL', 21, 'pending', null, null)]);
    const retry = listIncompleteReturnsToRetry(getDb(), [21]);
    expect(retry).toHaveLength(0);
  });

  it('does not return computed rows', () => {
    seedCandle('AAPL', '2024-01-02', 100);
    seedCandle('AAPL', '2024-01-10', 110);
    insertRealizedReturns(getDb(), [makeRow('2024-01-02', 'AAPL', 1, 'computed', 0.1, 0.05)]);
    expect(listIncompleteReturnsToRetry(getDb(), [1])).toHaveLength(0);
  });

  it('transitions pending → computed across runs: re-insert as computed makes it invisible to retry', () => {
    seedCandle('AAPL', '2024-01-02', 100);
    seedCandle('AAPL', '2024-01-10', 110);
    insertRealizedReturns(getDb(), [makeRow('2024-01-02', 'AAPL', 5, 'pending', null, null)]);
    expect(listIncompleteReturnsToRetry(getDb(), [5])).toHaveLength(1);
    insertRealizedReturns(getDb(), [makeRow('2024-01-02', 'AAPL', 5, 'computed', 0.1, 0.05)]);
    expect(listIncompleteReturnsToRetry(getDb(), [5])).toHaveLength(0);
  });
});
