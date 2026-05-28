import { describe, it, expect, beforeEach } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';
import { computeRealizedReturns } from '@/lib/jobs/compute-realized-returns';
import { getRealizedReturn } from '@/lib/db/queries/realized-returns';

const DIR = path.join(process.cwd(), '.vitest-cache', 'compute-realized-returns');
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

function seedMembership(ticker: string, from: string, to: string | null) {
  getDb().prepare(
    `INSERT INTO sp500_membership (ticker, from_date, to_date) VALUES (?, ?, ?)`
  ).run(ticker, from, to);
}

// 10 consecutive trading days Jan 2..Jan 15, 2024 (skipping weekend).
const TRADING_DAYS = [
  '2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05',
  '2024-01-08', '2024-01-09', '2024-01-10', '2024-01-11', '2024-01-12',
  '2024-01-15',
];

function seedTickerCalendar(ticker: string, dates: string[], priceStart = 100, step = 1) {
  for (let i = 0; i < dates.length; i++) {
    seedCandle(ticker, dates[i], priceStart + i * step);
  }
}

describe('computeRealizedReturns', () => {
  beforeEach(reset);

  it('computes return_pct as (close[D+h] - close[D]) / close[D] (close[D] entry convention, M2)', () => {
    seedTickerCalendar('AAPL', TRADING_DAYS, 100, 1); // close[D0]=100 .. close[D9]=109
    seedTickerCalendar('SPY', TRADING_DAYS, 200, 2);  // close[D0]=200 .. close[D9]=218
    seedScore('2024-01-02', 'AAPL', 'insider', 0.8);
    const stats = computeRealizedReturns(getDb(), [1, 5]);
    expect(stats.computed).toBeGreaterThanOrEqual(2);

    const r1 = getRealizedReturn(getDb(), '2024-01-02', 'AAPL', 1);
    expect(r1!.status).toBe('computed');
    // (101 - 100) / 100 = 0.01
    expect(r1!.return_pct).toBeCloseTo(0.01, 6);
    // SPY: (202 - 200) / 200 = 0.01; excess = 0.01 - 0.01 = 0
    expect(r1!.spy_excess_pct).toBeCloseTo(0.0, 6);

    const r5 = getRealizedReturn(getDb(), '2024-01-02', 'AAPL', 5);
    // (105 - 100) / 100 = 0.05
    expect(r5!.return_pct).toBeCloseTo(0.05, 6);
    // SPY: (210 - 200) / 200 = 0.05; excess = 0
    expect(r5!.spy_excess_pct).toBeCloseTo(0.0, 6);
  });

  it('preserves return_pct when SPY data is missing; spy_excess_pct is NULL (m5)', () => {
    seedTickerCalendar('AAPL', TRADING_DAYS, 100, 1);
    // No SPY at all.
    seedScore('2024-01-02', 'AAPL', 'insider', 0.8);
    computeRealizedReturns(getDb(), [1]);
    const r = getRealizedReturn(getDb(), '2024-01-02', 'AAPL', 1);
    expect(r!.status).toBe('computed');
    expect(r!.return_pct).toBeCloseTo(0.01, 6);
    expect(r!.spy_excess_pct).toBeNull();
  });

  it('classifies as pending when the forward horizon date has not yet been reached', () => {
    seedTickerCalendar('AAPL', TRADING_DAYS, 100, 1);
    seedTickerCalendar('SPY', TRADING_DAYS, 200, 2);
    seedScore('2024-01-15', 'AAPL', 'insider', 0.8); // last available date
    const stats = computeRealizedReturns(getDb(), [5]);
    const r = getRealizedReturn(getDb(), '2024-01-15', 'AAPL', 5);
    expect(r!.status).toBe('pending');
    expect(r!.return_pct).toBeNull();
    expect(stats.pending).toBeGreaterThanOrEqual(1);
  });

  it('classifies as no_entry_candle when ticker has no candle at date itself but date is a trading day', () => {
    // AAPL has candles for all 10 trading days. HALT has no candle on 2024-01-08.
    seedTickerCalendar('AAPL', TRADING_DAYS, 100, 1);
    const haltDates = TRADING_DAYS.filter(d => d !== '2024-01-08');
    seedTickerCalendar('HALT', haltDates, 100, 1);
    seedScore('2024-01-08', 'HALT', 'volume', 0.8);
    const stats = computeRealizedReturns(getDb(), [1, 5]);
    const r = getRealizedReturn(getDb(), '2024-01-08', 'HALT', 1);
    expect(r!.status).toBe('no_entry_candle');
    expect(r!.return_pct).toBeNull();
    expect(stats.no_entry).toBeGreaterThanOrEqual(2); // both horizons
  });

  it('classifies as delisted when ticker last candle predates date + horizon and ticker is flagged delisted', () => {
    seedTickerCalendar('AAPL', TRADING_DAYS, 100, 1);
    seedTickerCalendar('SPY', TRADING_DAYS, 200, 2);
    // DEAD only has candles for first 3 trading days; flagged delisted in membership.
    seedTickerCalendar('DEAD', TRADING_DAYS.slice(0, 3), 50, 1);
    seedMembership('DEAD', '2020-01-01', '2024-01-05');
    seedScore('2024-01-02', 'DEAD', 'insider', 0.8);
    computeRealizedReturns(getDb(), [5]);
    const r = getRealizedReturn(getDb(), '2024-01-02', 'DEAD', 5);
    expect(r!.status).toBe('delisted');
    expect(r!.return_pct).toBeNull();
  });

  it('excludes weekend backtest_scores (M3 trading-day filter)', () => {
    seedTickerCalendar('AAPL', TRADING_DAYS, 100, 1);
    seedScore('2024-01-06', 'AAPL', 'insider', 0.8); // Saturday — no candle on this date
    seedScore('2024-01-02', 'AAPL', 'insider', 0.8); // trading day
    computeRealizedReturns(getDb(), [1]);
    expect(getRealizedReturn(getDb(), '2024-01-06', 'AAPL', 1)).toBeNull();
    expect(getRealizedReturn(getDb(), '2024-01-02', 'AAPL', 1)).not.toBeNull();
  });

  it('is idempotent: running twice produces the same final row count', () => {
    seedTickerCalendar('AAPL', TRADING_DAYS, 100, 1);
    seedTickerCalendar('SPY', TRADING_DAYS, 200, 2);
    seedScore('2024-01-02', 'AAPL', 'insider', 0.8);
    computeRealizedReturns(getDb(), [1, 5]);
    const count1 = (getDb().prepare(`SELECT COUNT(*) AS n FROM realized_returns`).get() as { n: number }).n;
    computeRealizedReturns(getDb(), [1, 5]);
    const count2 = (getDb().prepare(`SELECT COUNT(*) AS n FROM realized_returns`).get() as { n: number }).n;
    expect(count2).toBe(count1);
  });

  it('NULL re-fill (M1): pending row becomes computed after candle advance', () => {
    seedTickerCalendar('AAPL', TRADING_DAYS.slice(0, 6), 100, 1); // 6 trading days
    seedTickerCalendar('SPY', TRADING_DAYS.slice(0, 6), 200, 2);
    seedScore('2024-01-02', 'AAPL', 'insider', 0.8);
    // First pass: 5 trading days from 2024-01-02 = 2024-01-09, but only 6 days seeded
    // (indices 0..5 → 2024-01-02..2024-01-09). So h=5 SHOULD compute (entry idx 0, exit idx 5).
    // We need pending — use horizon 21 instead.
    let stats = computeRealizedReturns(getDb(), [21]);
    expect(stats.pending).toBeGreaterThanOrEqual(1);
    let r = getRealizedReturn(getDb(), '2024-01-02', 'AAPL', 21);
    expect(r!.status).toBe('pending');

    // Advance candles to all 10 + extend further so 21-day horizon would be reachable... we only have 10 days
    // Add 30 more synthetic days to make 21 reachable
    const extraDates: string[] = [];
    let d = new Date('2024-01-15');
    for (let i = 0; i < 30; i++) {
      d = new Date(d.getTime() + 24 * 3600 * 1000);
      if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue; // skip weekends
      extraDates.push(d.toISOString().slice(0, 10));
    }
    seedTickerCalendar('AAPL', extraDates, 200, 1);
    seedTickerCalendar('SPY', extraDates, 300, 1);
    stats = computeRealizedReturns(getDb(), [21]);
    expect(stats.refilled).toBeGreaterThanOrEqual(1);
    r = getRealizedReturn(getDb(), '2024-01-02', 'AAPL', 21);
    expect(r!.status).toBe('computed');
    expect(r!.return_pct).not.toBeNull();
  });

  it('future-leak guard: pending row stored, not silently computed from partial data', () => {
    // Only 6 trading days seeded but request horizon 21.
    seedTickerCalendar('AAPL', TRADING_DAYS.slice(0, 6), 100, 1);
    seedTickerCalendar('SPY', TRADING_DAYS.slice(0, 6), 200, 2);
    seedScore('2024-01-02', 'AAPL', 'insider', 0.8);
    computeRealizedReturns(getDb(), [21]);
    const r = getRealizedReturn(getDb(), '2024-01-02', 'AAPL', 21);
    expect(r!.status).toBe('pending');
    expect(r!.return_pct).toBeNull();
  });
});
