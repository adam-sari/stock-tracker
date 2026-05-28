import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { makeTestDb } from '@/test/helpers/test-db';
import {
  pearson, spearman, rankify,
  pivotScores, avgCrossSectionalCorrMatrix,
} from '@/lib/backtest/correlations';

describe('pearson', () => {
  it('returns 1.0 for perfectly linear pairs', () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1.0, 6);
  });
  it('returns -1.0 for perfectly anti-linear pairs', () => {
    expect(pearson([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1.0, 6);
  });
  it('returns ~0 for unrelated pairs', () => {
    expect(Math.abs(pearson([1, 2, 3, 4, 5], [3, 1, 4, 1, 5]))).toBeLessThan(0.7);
  });
  it('returns NaN for n<2', () => {
    expect(Number.isNaN(pearson([1], [1]))).toBe(true);
  });
  it('returns NaN for zero-variance in x (m9 — x-branch)', () => {
    expect(Number.isNaN(pearson([1, 1, 1], [2, 3, 4]))).toBe(true);
  });
  it('returns NaN for zero-variance in y (m9 — y-branch)', () => {
    expect(Number.isNaN(pearson([2, 3, 4], [1, 1, 1]))).toBe(true);
  });
  it('returns NaN for constant pairs (m9 — both branches)', () => {
    expect(Number.isNaN(pearson([1, 1, 1], [1, 1, 1]))).toBe(true);
  });
});

describe('rankify', () => {
  it('returns 1-based ranks, midrank for ties', () => {
    expect(rankify([10, 20, 30])).toEqual([1, 2, 3]);
    expect(rankify([10, 10, 20])).toEqual([1.5, 1.5, 3]);
    expect(rankify([10, 10, 10, 20])).toEqual([2, 2, 2, 4]);
  });
});

describe('spearman', () => {
  it('returns 1.0 for monotonic-increasing pairs (even nonlinear)', () => {
    expect(spearman([1, 2, 3, 4], [1, 4, 9, 16])).toBeCloseTo(1.0, 6);
  });
  it('returns -1.0 for monotonic-decreasing pairs', () => {
    expect(spearman([1, 2, 3, 4], [16, 9, 4, 1])).toBeCloseTo(-1.0, 6);
  });
});

describe('pivotScores (M5)', () => {
  const testDb = makeTestDb('correlations');
  beforeEach(testDb.reset);
  afterAll(testDb.teardown);

  it('pivots (date, ticker, signal) rows into wide (date, ticker) × signal records, zero-padding NULLs', () => {
    const db = testDb.reset();
    // Seed candles_daily so the trading-day filter (m7) doesn't drop our dates.
    db.prepare(`INSERT INTO candles_daily (date, ticker, open, high, low, close, volume, source) VALUES (?, 'AAPL', 1, 1, 1, 1, 0, 'test')`).run('2024-03-15');
    db.prepare(`INSERT INTO candles_daily (date, ticker, open, high, low, close, volume, source) VALUES (?, 'NVDA', 1, 1, 1, 1, 0, 'test')`).run('2024-03-15');
    db.prepare(`INSERT INTO candles_daily (date, ticker, open, high, low, close, volume, source) VALUES (?, 'AAPL', 1, 1, 1, 1, 0, 'test')`).run('2024-03-16');
    db.prepare(`INSERT INTO candles_daily (date, ticker, open, high, low, close, volume, source) VALUES (?, 'NVDA', 1, 1, 1, 1, 0, 'test')`).run('2024-03-16');

    db.prepare(`INSERT INTO backtest_scores (date, ticker, signal_kind, score, detail_json) VALUES (?, ?, ?, ?, '{}')`).run('2024-03-15', 'AAPL', 'insider', 0.8);
    db.prepare(`INSERT INTO backtest_scores (date, ticker, signal_kind, score, detail_json) VALUES (?, ?, ?, ?, '{}')`).run('2024-03-15', 'AAPL', 'volume',  0.5);
    db.prepare(`INSERT INTO backtest_scores (date, ticker, signal_kind, score, detail_json) VALUES (?, ?, ?, ?, '{}')`).run('2024-03-15', 'NVDA', 'volume',  0.3);
    db.prepare(`INSERT INTO backtest_scores (date, ticker, signal_kind, score, detail_json) VALUES (?, ?, ?, ?, '{}')`).run('2024-03-16', 'AAPL', 'insider', 0.6);

    const wide = pivotScores(db, 365_000);  // big window so March 2024 is included
    const aapl15 = wide.find(r => r.date === '2024-03-15' && r.ticker === 'AAPL')!;
    expect(aapl15.insider).toBe(0.8);
    expect(aapl15.volume).toBe(0.5);
    expect(aapl15.congress).toBe(0);  // zero-padded (M2), not null
    expect(aapl15.halts).toBe(0);

    const nvda15 = wide.find(r => r.date === '2024-03-15' && r.ticker === 'NVDA')!;
    expect(nvda15.insider).toBe(0);   // zero-padded
    expect(nvda15.volume).toBe(0.3);

    // 3 rows: AAPL/2024-03-15, NVDA/2024-03-15, AAPL/2024-03-16 — only (date,ticker) keys that appear in scores
    expect(wide.length).toBe(3);
  });

  it('filters out non-trading-day backtest_scores rows (m7)', () => {
    const db = testDb.reset();
    db.prepare(`INSERT INTO candles_daily (date, ticker, open, high, low, close, volume, source) VALUES (?, 'AAPL', 1, 1, 1, 1, 0, 'test')`).run('2024-03-15');
    db.prepare(`INSERT INTO backtest_scores (date, ticker, signal_kind, score, detail_json) VALUES (?, ?, ?, ?, '{}')`).run('2024-03-15', 'AAPL', 'insider', 0.8);
    db.prepare(`INSERT INTO backtest_scores (date, ticker, signal_kind, score, detail_json) VALUES (?, ?, ?, ?, '{}')`).run('2024-03-16', 'AAPL', 'insider', 0.9);  // weekend, no candle
    const wide = pivotScores(db, 365_000);
    expect(wide.length).toBe(1);
    expect(wide[0].date).toBe('2024-03-15');
  });
});

describe('avgCrossSectionalCorrMatrix (M1)', () => {
  it('averages per-date pairwise correlation across dates and reports SE-across-dates', () => {
    const wide: Array<Record<string, number | string>> = [];
    for (const date of ['2024-03-15', '2024-03-16', '2024-03-17']) {
      wide.push({ date, ticker: 'A', insider: 0.1, volume: 0.2 });
      wide.push({ date, ticker: 'B', insider: 0.3, volume: 0.5 });
      wide.push({ date, ticker: 'C', insider: 0.5, volume: 0.8 });
      wide.push({ date, ticker: 'D', insider: 0.7, volume: 0.9 });
    }
    const m = avgCrossSectionalCorrMatrix(wide as any, 'pearson');
    const i = m.signals.indexOf('insider'), j = m.signals.indexOf('volume');
    expect(m.values[i][j]).toBeCloseTo(1.0, 1);  // each date's r ≈ 1
    expect(m.values[i][j]).toBeCloseTo(m.values[j][i], 6);
    expect(m.ses[i][j]).toBeLessThan(0.05);  // identical structure → ~0 SE
    expect(m.ns[i][j]).toBe(3);  // 3 dates contributed
  });

  it('symmetry: values[i][j] === values[j][i], ns[i][j] === ns[j][i] (m10)', () => {
    const wide: Array<Record<string, number | string>> = [];
    for (const date of ['2024-03-15', '2024-03-16']) {
      wide.push({ date, ticker: 'A', insider: 0.1, volume: 0.9, halts: 0 });
      wide.push({ date, ticker: 'B', insider: 0.4, volume: 0.6, halts: 0.3 });
      wide.push({ date, ticker: 'C', insider: 0.8, volume: 0.2, halts: 0.7 });
    }
    const m = avgCrossSectionalCorrMatrix(wide as any, 'spearman');
    for (let i = 0; i < m.signals.length; i++) {
      for (let j = 0; j < m.signals.length; j++) {
        if (Number.isNaN(m.values[i][j]) && Number.isNaN(m.values[j][i])) continue;
        expect(m.values[i][j]).toBeCloseTo(m.values[j][i], 6);
        expect(m.ns[i][j]).toBe(m.ns[j][i]);
      }
    }
  });

  it('skips dates where a pair has n<3 (Spearman skip rule from red-team finding)', () => {
    const wide: Array<Record<string, number | string>> = [
      // Only date with 2 rows → skipped
      { date: '2024-03-15', ticker: 'A', insider: 0.1, volume: 0.2 },
      { date: '2024-03-15', ticker: 'B', insider: 0.4, volume: 0.5 },
      // Date with 3 rows → counts
      { date: '2024-03-16', ticker: 'A', insider: 0.1, volume: 0.2 },
      { date: '2024-03-16', ticker: 'B', insider: 0.3, volume: 0.4 },
      { date: '2024-03-16', ticker: 'C', insider: 0.5, volume: 0.6 },
    ];
    const m = avgCrossSectionalCorrMatrix(wide as any, 'pearson');
    const i = m.signals.indexOf('insider'), j = m.signals.indexOf('volume');
    expect(m.ns[i][j]).toBe(1);  // only the 3-row date contributes
  });
});
