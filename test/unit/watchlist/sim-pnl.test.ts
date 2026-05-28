import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { getDb } from '@/lib/db/connection';
import { makeTestDb } from '@/test/helpers/test-db';
import { simulateWatchlistPnL } from '@/lib/watchlist/sim-pnl';

const testDb = makeTestDb('sim-pnl');

function insWatch(ticker: string, addedYmd: string) {
  const ts = Math.floor(new Date(`${addedYmd}T14:00:00Z`).getTime() / 1000);
  getDb().prepare(`INSERT INTO watchlist (ticker, added_at) VALUES (?, ?)`).run(ticker, ts);
}
function insCandle(date: string, ticker: string, close: number) {
  getDb().prepare(
    `INSERT INTO candles_daily (date, ticker, open, high, low, close, volume, source) VALUES (?, ?, ?, ?, ?, ?, 1000, 'test')`
  ).run(date, ticker, close, close, close, close);
}
function insSplit(ticker: string, ex_date: string, ratio: number) {
  getDb().prepare(
    `INSERT INTO corporate_actions (id, ticker, kind, ex_date, amount, source) VALUES (?, ?, 'split', ?, ?, 'test')`
  ).run(`${ticker}-${ex_date}-split`, ticker, ex_date, ratio);
}
function insDelisting(ticker: string, from_date: string, to_date: string) {
  getDb().prepare(
    `INSERT INTO sp500_membership (ticker, from_date, to_date) VALUES (?, ?, ?)`
  ).run(ticker, from_date, to_date);
}

describe('simulateWatchlistPnL', () => {
  beforeEach(testDb.reset);
  afterAll(testDb.teardown);

  it('returns one row per watched ticker with status=active for normal tickers', () => {
    insWatch('AAPL', '2024-01-02');
    insWatch('NVDA', '2024-01-02');
    insCandle('2024-01-02', 'AAPL', 100); insCandle('2024-12-31', 'AAPL', 150);
    insCandle('2024-01-02', 'NVDA', 200); insCandle('2024-12-31', 'NVDA', 300);
    insCandle('2024-01-02', 'SPY',  400); insCandle('2024-12-31', 'SPY',  440);
    const res = simulateWatchlistPnL(getDb(), '2024-12-31');
    expect(res.rows).toHaveLength(2);
    const aapl = res.rows.find(r => r.ticker === 'AAPL')!;
    expect(aapl.status).toBe('active');
    expect(aapl.entryClose).toBe(100);
    expect(aapl.exitClose).toBe(150);
    expect(aapl.returnPct).toBeCloseTo(0.5, 6);
    expect(aapl.spyExcessPct).toBeCloseTo(0.5 - 0.1, 6);
  });

  it('applies split adjustment to entry close', () => {
    insWatch('NVDA', '2024-01-02');
    insCandle('2024-01-02', 'NVDA', 800);
    insCandle('2024-12-31', 'NVDA', 200);
    insSplit('NVDA', '2024-06-10', 10.0);
    insCandle('2024-01-02', 'SPY', 400); insCandle('2024-12-31', 'SPY', 400);
    const res = simulateWatchlistPnL(getDb(), '2024-12-31');
    const nvda = res.rows.find(r => r.ticker === 'NVDA')!;
    expect(nvda.splitAdjFactor).toBeCloseTo(1 / 10.0, 9);
    expect(nvda.returnPct).toBeCloseTo(1.5, 6);
  });

  it('marks a row delisted when sp500_membership has a to_date BEFORE asOf', () => {
    insWatch('DELC', '2024-01-02');
    insCandle('2024-01-02', 'DELC', 100);
    insCandle('2024-03-15', 'DELC', 60);
    insCandle('2024-01-02', 'SPY', 400);  insCandle('2024-12-31', 'SPY', 440);
    insDelisting('DELC', '2020-01-01', '2024-03-15');
    const res = simulateWatchlistPnL(getDb(), '2024-12-31');
    const delc = res.rows.find(r => r.ticker === 'DELC')!;
    expect(delc.status).toBe('delisted');
    expect(delc.delistDate).toBe('2024-03-15');
    expect(delc.exitDate).toBe('2024-03-15');
  });

  it('marks a row stale when last candle is >10 trading days before asOf (no delisting record)', () => {
    insWatch('HALT', '2024-01-02');
    insCandle('2024-01-02', 'HALT', 100);
    insCandle('2024-02-01', 'HALT', 90);
    insCandle('2024-01-02', 'SPY', 400); insCandle('2024-03-15', 'SPY', 410);
    const res = simulateWatchlistPnL(getDb(), '2024-03-15');
    const halt = res.rows.find(r => r.ticker === 'HALT')!;
    expect(halt.status).toBe('stale');
    expect(halt.exitDate).toBe('2024-02-01');
  });

  it('uses the next available close when added_at falls on a non-trading day', () => {
    insWatch('AAPL', '2024-01-01');
    insCandle('2024-01-02', 'AAPL', 100);
    insCandle('2024-12-31', 'AAPL', 110);
    insCandle('2024-01-02', 'SPY',  400);
    insCandle('2024-12-31', 'SPY',  400);
    const res = simulateWatchlistPnL(getDb(), '2024-12-31');
    expect(res.rows[0].entryDate).toBe('2024-01-02');
    expect(res.rows[0].entryClose).toBe(100);
  });

  it('skips tickers whose first candle is >14 trading days AFTER added_at (no_entry_candle_within_window)', () => {
    insWatch('LATE', '2024-01-02');
    insCandle('2024-06-01', 'LATE', 100);
    insCandle('2024-01-02', 'SPY', 400); insCandle('2024-12-31', 'SPY', 440);
    const res = simulateWatchlistPnL(getDb(), '2024-12-31');
    expect(res.rows).toHaveLength(0);
    expect(res.skipped).toContainEqual({ ticker: 'LATE', reason: 'no_entry_candle_within_window' });
  });

  it('skips tickers with no candles at all (reason=no_data)', () => {
    insWatch('NEWLY', '2024-01-02');
    insCandle('2024-01-02', 'SPY', 400); insCandle('2024-12-31', 'SPY', 440);
    const res = simulateWatchlistPnL(getDb(), '2024-12-31');
    expect(res.rows).toHaveLength(0);
    expect(res.skipped).toContainEqual({ ticker: 'NEWLY', reason: 'no_data' });
  });

  it('computes per-ticker mean aggregate', () => {
    insWatch('AAPL', '2024-01-02');
    insWatch('NVDA', '2024-01-02');
    insCandle('2024-01-02', 'AAPL', 100); insCandle('2024-12-31', 'AAPL', 150);
    insCandle('2024-01-02', 'NVDA', 100); insCandle('2024-12-31', 'NVDA',  50);
    insCandle('2024-01-02', 'SPY',  400); insCandle('2024-12-31', 'SPY',  400);
    const res = simulateWatchlistPnL(getDb(), '2024-12-31');
    expect(res.aggregate.perTickerMean.returnPct).toBeCloseTo(0.0, 6);
    expect(res.aggregate.perTickerMean.spyExcessPct).toBeCloseTo(0.0, 6);
    expect(res.aggregate.perTickerMean.hitRate).toBeCloseTo(0.5, 6);
    expect(res.aggregate.n).toBe(2);
  });

  it('computes equal-weight portfolio aggregate (the goal-statement answer)', () => {
    insWatch('AAPL', '2024-01-02');
    insWatch('NVDA', '2024-01-02');
    insCandle('2024-01-02', 'AAPL', 100); insCandle('2024-12-31', 'AAPL', 150);
    insCandle('2024-01-02', 'NVDA', 100); insCandle('2024-12-31', 'NVDA',  50);
    insCandle('2024-01-02', 'SPY',  400); insCandle('2024-12-31', 'SPY',  400);
    const res = simulateWatchlistPnL(getDb(), '2024-12-31');
    expect(res.aggregate.portfolio.returnPct).toBeCloseTo(0.0, 6);
    expect(res.aggregate.portfolio.spyExcessPct).toBeCloseTo(0.0, 6);
  });

  it('portfolio aggregate equals per-ticker mean for buy-and-hold equal-weight', () => {
    insWatch('AAPL', '2022-01-03');
    insWatch('NVDA', '2024-12-30');
    insCandle('2022-01-03', 'AAPL', 100); insCandle('2024-12-31', 'AAPL', 300);
    insCandle('2024-12-30', 'NVDA', 100); insCandle('2024-12-31', 'NVDA', 99);
    insCandle('2022-01-03', 'SPY', 400);  insCandle('2024-12-30', 'SPY', 400); insCandle('2024-12-31', 'SPY', 400);
    const res = simulateWatchlistPnL(getDb(), '2024-12-31');
    expect(res.aggregate.portfolio.returnPct).toBeCloseTo(0.995, 4);
  });

  it('uses the latest SPY close on or before asOfDate as the exit benchmark', () => {
    insWatch('AAPL', '2024-01-02');
    insCandle('2024-01-02', 'AAPL', 100); insCandle('2024-01-03', 'AAPL', 110);
    insCandle('2024-01-02', 'SPY',  400); insCandle('2024-01-03', 'SPY', 404);
    const res = simulateWatchlistPnL(getDb(), '2024-01-03');
    expect(res.rows[0].exitDate).toBe('2024-01-03');
    expect(res.rows[0].exitClose).toBe(110);
  });

  it('reports `spyMissing: true` and returns empty rows when no SPY candles exist', () => {
    insWatch('AAPL', '2024-01-02');
    insCandle('2024-01-02', 'AAPL', 100); insCandle('2024-12-31', 'AAPL', 150);
    const res = simulateWatchlistPnL(getDb(), '2024-12-31');
    expect(res.spyMissing).toBe(true);
    expect(res.rows).toHaveLength(0);
  });

  it('delisted tickers do NOT contribute to portfolio aggregate', () => {
    insWatch('LIVE', '2024-01-02');
    insWatch('DELC', '2024-01-02');
    insCandle('2024-01-02', 'LIVE', 100); insCandle('2024-12-31', 'LIVE', 200);
    insCandle('2024-01-02', 'DELC', 100); insCandle('2024-03-15', 'DELC',  50);
    insCandle('2024-01-02', 'SPY',  400); insCandle('2024-12-31', 'SPY',  400);
    insDelisting('DELC', '2020-01-01', '2024-03-15');
    const res = simulateWatchlistPnL(getDb(), '2024-12-31');
    expect(res.aggregate.n).toBe(2);
    expect(res.aggregate.perTickerMean.returnPct).toBeCloseTo((1.0 + -0.5) / 2, 6);
    expect(res.aggregate.portfolio.returnPct).toBeCloseTo(1.0, 6);
    expect(res.aggregate.portfolio.activeN).toBe(1);
  });
});
