import { describe, it, expect } from 'vitest';
import { computePortfolioValue } from '@/lib/computations/portfolio';
import type { Holding } from '@/lib/db/queries/holdings';

describe('computePortfolioValue', () => {
  it('computes value, total P&L $, and total P&L % with current prices', () => {
    const holdings: Holding[] = [
      { ticker: 'AAPL', qty: 10, avg_cost: 150, total_cost: 1500 },
      { ticker: 'NVDA', qty: 5, avg_cost: 400, total_cost: 2000 },
    ];
    const quotes = new Map([
      ['AAPL', 200],
      ['NVDA', 500],
    ]);
    const result = computePortfolioValue(holdings, quotes);

    expect(result.total_value).toBe(10 * 200 + 5 * 500);
    expect(result.total_cost).toBe(1500 + 2000);
    expect(result.total_pnl).toBe(1000);
    expect(result.total_pnl_pct).toBeCloseTo(1000 / 3500, 4);
    expect(result.rows.length).toBe(2);
    expect(result.rows.find(r => r.ticker === 'AAPL')!.market_value).toBe(2000);
  });

  it('treats missing quotes as zero market value (stale)', () => {
    const holdings: Holding[] = [
      { ticker: 'AAPL', qty: 10, avg_cost: 150, total_cost: 1500 },
    ];
    const result = computePortfolioValue(holdings, new Map());
    expect(result.total_value).toBe(0);
    expect(result.rows[0].market_value).toBe(0);
    expect(result.rows[0].stale).toBe(true);
  });

  it('returns zeros for empty portfolio', () => {
    const result = computePortfolioValue([], new Map());
    expect(result.total_value).toBe(0);
    expect(result.total_pnl).toBe(0);
    expect(result.total_pnl_pct).toBe(0);
    expect(result.rows.length).toBe(0);
  });
});
