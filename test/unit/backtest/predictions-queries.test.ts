import { describe, it, expect, beforeEach } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';
import {
  listPredictionsWithReturns,
  computeHitRate,
} from '@/lib/backtest/predictions-queries';
import { insertRealizedReturns, type RealizedReturnRow } from '@/lib/db/queries/realized-returns';

const DIR = path.join(process.cwd(), '.vitest-cache', 'predictions-queries');
const DB_PATH = path.join(DIR, 'test.db');

function reset() {
  closeDb();
  if (existsSync(DIR)) rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
  process.env.DB_PATH = DB_PATH;
  applySchema(getDb());
}

function seedScore(date: string, ticker: string, kind: string, score: number) {
  getDb().prepare(
    `INSERT INTO backtest_scores (date, ticker, signal_kind, score, detail_json)
     VALUES (?, ?, ?, ?, '{}')`
  ).run(date, ticker, kind, score);
}

function row(date: string, ticker: string, h: number, ret: number | null, spy: number | null, status: RealizedReturnRow['status'] = 'computed'): RealizedReturnRow {
  return { date, ticker, horizon_days: h, return_pct: ret, spy_excess_pct: spy, status, computed_at: 0 };
}

describe('listPredictionsWithReturns', () => {
  beforeEach(reset);

  it('joins backtest_scores to realized_returns and pivots horizons into columns', () => {
    seedScore('2024-01-02', 'AAPL', 'insider', 0.8);
    insertRealizedReturns(getDb(), [
      row('2024-01-02', 'AAPL', 1, 0.01, 0.005),
      row('2024-01-02', 'AAPL', 5, 0.04, 0.02),
      row('2024-01-02', 'AAPL', 21, 0.10, 0.05),
      row('2024-01-02', 'AAPL', 63, 0.20, 0.12),
    ]);
    const rows = listPredictionsWithReturns(getDb(), {});
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.ticker).toBe('AAPL');
    expect(r.signal_kind).toBe('insider');
    expect(r.score).toBeCloseTo(0.8, 6);
    expect(r.return_1d).toBeCloseTo(0.01, 6);
    expect(r.return_5d).toBeCloseTo(0.04, 6);
    expect(r.return_21d).toBeCloseTo(0.10, 6);
    expect(r.return_63d).toBeCloseTo(0.20, 6);
    expect(r.spy_excess_1d).toBeCloseTo(0.005, 6);
  });

  it('sorts DESC by score by default', () => {
    seedScore('2024-01-02', 'AAPL', 'insider', 0.7);
    seedScore('2024-01-02', 'NVDA', 'insider', 0.9);
    seedScore('2024-01-02', 'TSLA', 'insider', 0.5);
    const rows = listPredictionsWithReturns(getDb(), {});
    expect(rows.map(r => r.ticker)).toEqual(['NVDA', 'AAPL', 'TSLA']);
  });

  it('filters by signalKind', () => {
    seedScore('2024-01-02', 'AAPL', 'insider', 0.8);
    seedScore('2024-01-02', 'NVDA', 'volume', 0.9);
    const rows = listPredictionsWithReturns(getDb(), { signalKind: 'insider' });
    expect(rows).toHaveLength(1);
    expect(rows[0].ticker).toBe('AAPL');
  });

  it('filters by minScore', () => {
    seedScore('2024-01-02', 'AAPL', 'insider', 0.5);
    seedScore('2024-01-02', 'NVDA', 'insider', 0.9);
    const rows = listPredictionsWithReturns(getDb(), { minScore: 0.7 });
    expect(rows).toHaveLength(1);
    expect(rows[0].ticker).toBe('NVDA');
  });

  it('respects limit', () => {
    for (let i = 0; i < 10; i++) {
      seedScore('2024-01-02', `T${i}`, 'insider', 0.1 + i * 0.05);
    }
    const rows = listPredictionsWithReturns(getDb(), { limit: 3 });
    expect(rows).toHaveLength(3);
  });

  it('orderBy date returns rows sorted DESC by date', () => {
    seedScore('2024-01-02', 'AAPL', 'insider', 0.8);
    seedScore('2024-01-09', 'AAPL', 'insider', 0.7);
    const rows = listPredictionsWithReturns(getDb(), { orderBy: 'date' });
    expect(rows[0].date).toBe('2024-01-09');
    expect(rows[1].date).toBe('2024-01-02');
  });
});

describe('computeHitRate', () => {
  beforeEach(reset);

  it('counts hits (spy_excess > 0) and computes mean stats over computed rows', () => {
    seedScore('2024-01-02', 'A', 'insider', 0.8);
    seedScore('2024-01-03', 'B', 'insider', 0.8);
    seedScore('2024-01-04', 'C', 'insider', 0.8);
    seedScore('2024-01-05', 'D', 'insider', 0.8);
    insertRealizedReturns(getDb(), [
      row('2024-01-02', 'A', 5, 0.10, 0.05),  // hit
      row('2024-01-03', 'B', 5, 0.05, -0.01), // not a hit
      row('2024-01-04', 'C', 5, 0.20, 0.15),  // hit
      row('2024-01-05', 'D', 5, 0.00, 0.00),  // not a hit (spy_excess not > 0)
    ]);
    const hr = computeHitRate(getDb(), { horizon: 5, minScore: 0 });
    expect(hr.n).toBe(4);
    expect(hr.hits).toBe(2);
    expect(hr.hitRate).toBeCloseTo(0.5, 6);
    expect(hr.meanReturn).toBeCloseTo((0.10 + 0.05 + 0.20 + 0.00) / 4, 6);
    expect(hr.meanSpyExcess).toBeCloseTo((0.05 - 0.01 + 0.15 + 0.00) / 4, 6);
  });

  it('excludes NULL returns (e.g., pending status) from the denominator', () => {
    seedScore('2024-01-02', 'A', 'insider', 0.8);
    seedScore('2024-01-03', 'B', 'insider', 0.8);
    insertRealizedReturns(getDb(), [
      row('2024-01-02', 'A', 5, 0.10, 0.05, 'computed'),
      row('2024-01-03', 'B', 5, null, null, 'pending'),
    ]);
    const hr = computeHitRate(getDb(), { horizon: 5, minScore: 0 });
    expect(hr.n).toBe(1);
    expect(hr.hits).toBe(1);
  });

  it('filters by minScore', () => {
    seedScore('2024-01-02', 'A', 'insider', 0.3);
    seedScore('2024-01-03', 'B', 'insider', 0.9);
    insertRealizedReturns(getDb(), [
      row('2024-01-02', 'A', 5, -0.05, -0.05),
      row('2024-01-03', 'B', 5, 0.10, 0.05),
    ]);
    const hr = computeHitRate(getDb(), { horizon: 5, minScore: 0.5 });
    expect(hr.n).toBe(1);
    expect(hr.hits).toBe(1);
  });

  it('filters by signalKind', () => {
    seedScore('2024-01-02', 'A', 'insider', 0.8);
    seedScore('2024-01-03', 'B', 'volume', 0.8);
    insertRealizedReturns(getDb(), [
      row('2024-01-02', 'A', 5, 0.10, 0.05),
      row('2024-01-03', 'B', 5, -0.05, -0.10),
    ]);
    const hr = computeHitRate(getDb(), { horizon: 5, minScore: 0, signalKind: 'insider' });
    expect(hr.n).toBe(1);
    expect(hr.hits).toBe(1);
  });

  it('returns zero stats on empty match', () => {
    const hr = computeHitRate(getDb(), { horizon: 5, minScore: 0.9 });
    expect(hr.n).toBe(0);
    expect(hr.hits).toBe(0);
    expect(hr.hitRate).toBe(0);
    expect(hr.meanReturn).toBe(0);
    expect(hr.meanSpyExcess).toBe(0);
  });
});
