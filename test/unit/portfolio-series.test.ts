import { describe, it, expect } from 'vitest';
import { computePortfolioSeries } from '@/lib/computations/portfolio-series';
import type { CandlePoint } from '@/lib/computations/portfolio-series';
import type { Transaction } from '@/lib/db/queries/transactions';

// Helper: build a Transaction-shaped object (id/created_at are not used by the function)
function txn(
  ticker: string,
  kind: 'buy' | 'sell',
  qty: number,
  price: number,
  executed_at: string,
): Transaction {
  return { id: 0, ticker, kind, qty, price, fees: 0, executed_at, note: undefined, created_at: '' } as unknown as Transaction;
}

// Helper: create a candle point from a Date + close price
function candle(date: Date, close: number): CandlePoint {
  return { ts: Math.floor(date.getTime() / 1000), close };
}

const D = (s: string) => new Date(s);

describe('computePortfolioSeries', () => {
  it('returns [] for empty transactions', () => {
    const candles = new Map<string, CandlePoint[]>([
      ['AAPL', [candle(D('2026-01-02'), 150), candle(D('2026-01-03'), 155)]],
    ]);
    const result = computePortfolioSeries([], candles, D('2026-01-01'), D('2026-01-31'));
    expect(result).toEqual([]);
  });

  it('returns [] when candlesByTicker is empty', () => {
    const txns = [txn('AAPL', 'buy', 10, 150, '2026-01-01T00:00:00Z')];
    const result = computePortfolioSeries(txns, new Map(), D('2026-01-01'), D('2026-01-31'));
    expect(result).toEqual([]);
  });

  it('single buy with steady close → flat value line equal to qty * close', () => {
    const close = 150;
    const qty = 10;
    // Buy executed before the range
    const txns = [txn('AAPL', 'buy', qty, close, '2025-12-31T00:00:00Z')];
    const c1 = candle(D('2026-01-02'), close);
    const c2 = candle(D('2026-01-03'), close);
    const c3 = candle(D('2026-01-04'), close);
    const candles = new Map<string, CandlePoint[]>([['AAPL', [c1, c2, c3]]]);
    const result = computePortfolioSeries(txns, candles, D('2026-01-01'), D('2026-01-31'));

    expect(result.length).toBe(3);
    for (const pt of result) {
      expect(pt.value).toBeCloseTo(qty * close, 6);
    }
  });

  it('cost_basis tracks buy cost, and decreases proportionally on sell', () => {
    // Buy 10 @ 100 = $1000 cost, then sell 5
    const buyTs = '2026-01-01T00:00:00Z';
    const sellTs = '2026-01-03T00:00:00Z';

    const txns = [
      txn('AAPL', 'buy', 10, 100, buyTs),
      txn('AAPL', 'sell', 5, 120, sellTs),
    ];

    // Three daily candles: Jan 2, Jan 3, Jan 4
    const c1 = candle(D('2026-01-02'), 110); // before sell: 10 shares
    const c2 = candle(D('2026-01-03'), 120); // sell timestamp same second as candle 2
    const c3 = candle(D('2026-01-04'), 130); // after sell: 5 shares

    // Make sell ts match candle 2 exactly so we can reason about ordering
    // The sell is executed_at 2026-01-03T00:00:00Z and candle ts is the same day
    // The sell will be applied before candle c2 (or at same ts)
    const candles = new Map<string, CandlePoint[]>([['AAPL', [c1, c2, c3]]]);
    const result = computePortfolioSeries(txns, candles, D('2026-01-01'), D('2026-12-31'));

    expect(result.length).toBe(3);

    // At c1: 10 shares, cost_basis = 1000, value = 10 * 110 = 1100
    const p1 = result[0];
    expect(p1.ts).toBe(c1.ts);
    expect(p1.value).toBeCloseTo(10 * 110, 5);
    expect(p1.cost_basis).toBeCloseTo(1000, 5);

    // At c3: 5 shares remain, cost_basis = 500 (half), value = 5 * 130 = 650
    const p3 = result[2];
    expect(p3.ts).toBe(c3.ts);
    expect(p3.value).toBeCloseTo(5 * 130, 5);
    expect(p3.cost_basis).toBeCloseTo(500, 5);
  });

  it('two holdings with different start dates → series shows nonzero from first holding', () => {
    // AAPL bought earlier, NVDA bought later
    const txns = [
      txn('AAPL', 'buy', 5, 100, '2026-01-02T00:00:00Z'),
      txn('NVDA', 'buy', 2, 200, '2026-01-04T00:00:00Z'),
    ];

    const aaplCandles: CandlePoint[] = [
      candle(D('2026-01-02'), 100),
      candle(D('2026-01-03'), 105),
      candle(D('2026-01-04'), 110),
      candle(D('2026-01-05'), 115),
    ];
    const nvdaCandles: CandlePoint[] = [
      candle(D('2026-01-04'), 200),
      candle(D('2026-01-05'), 210),
    ];

    const candles = new Map<string, CandlePoint[]>([
      ['AAPL', aaplCandles],
      ['NVDA', nvdaCandles],
    ]);

    const result = computePortfolioSeries(txns, candles, D('2026-01-01'), D('2026-01-31'));
    expect(result.length).toBe(4);

    // Jan 2: only AAPL (buy is at 2026-01-02T00:00:00Z which is ts=... matched to candle ts)
    // AAPL buy ts <= candle ts at Jan 2, value = 5*100
    const p0 = result.find(p => p.ts === aaplCandles[0].ts)!;
    expect(p0).toBeDefined();
    expect(p0.value).toBeCloseTo(5 * 100, 5);

    // Jan 5: both AAPL + NVDA present, value = 5*115 + 2*210
    const p3 = result.find(p => p.ts === aaplCandles[3].ts)!;
    expect(p3).toBeDefined();
    expect(p3.value).toBeCloseTo(5 * 115 + 2 * 210, 5);
    expect(p3.cost_basis).toBeCloseTo(5 * 100 + 2 * 200, 5);
  });

  it('ticker with no candles in range contributes 0 value (skipped)', () => {
    const txns = [
      txn('AAPL', 'buy', 10, 100, '2026-01-01T00:00:00Z'),
      txn('NVDA', 'buy', 5, 200, '2026-01-01T00:00:00Z'),
    ];
    // Only AAPL has candles in range; NVDA has no candles
    const candles = new Map<string, CandlePoint[]>([
      ['AAPL', [candle(D('2026-01-02'), 110)]],
      ['NVDA', []], // empty
    ]);
    const result = computePortfolioSeries(txns, candles, D('2026-01-01'), D('2026-01-31'));
    expect(result.length).toBe(1);
    // NVDA contributes 0
    expect(result[0].value).toBeCloseTo(10 * 110, 5);
  });
});
