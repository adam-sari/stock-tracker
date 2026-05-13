import { describe, it, expect } from 'vitest';
import {
  scoreInsiderClusters,
  scoreCongressBuys,
  score13FAccumulation,
  scoreHaltEvents,
  aggregateScores,
  DEFAULT_WEIGHTS,
} from '@/lib/computations/discovery';

describe('scoreInsiderClusters', () => {
  it('counts distinct insiders buying within 30-day window, code=P, non-derivative', () => {
    const now = Math.floor(new Date('2026-05-13T00:00:00Z').getTime() / 1000);
    const day = 86400;
    const rows = [
      // PLTR cluster: 3 distinct insiders within 30 days
      { id: '1', ticker: 'PLTR', insider_name: 'A', code: 'P', is_derivative: 0, txn_date: '2026-05-01', filed_at: now - 12 * day },
      { id: '2', ticker: 'PLTR', insider_name: 'B', code: 'P', is_derivative: 0, txn_date: '2026-05-03', filed_at: now - 10 * day },
      { id: '3', ticker: 'PLTR', insider_name: 'C', code: 'P', is_derivative: 0, txn_date: '2026-05-10', filed_at: now - 3 * day },
      // AAPL only one
      { id: '4', ticker: 'AAPL', insider_name: 'X', code: 'P', is_derivative: 0, txn_date: '2026-05-10', filed_at: now - 3 * day },
      // NVDA only sales (not counted)
      { id: '5', ticker: 'NVDA', insider_name: 'Y', code: 'S', is_derivative: 0, txn_date: '2026-05-10', filed_at: now - 3 * day },
      // TSLA derivatives (not counted)
      { id: '6', ticker: 'TSLA', insider_name: 'Z', code: 'P', is_derivative: 1, txn_date: '2026-05-10', filed_at: now - 3 * day },
    ];
    const scores = scoreInsiderClusters(rows as any, now, 30);
    expect(scores.get('PLTR')?.score).toBeCloseTo(3 / 5, 4);
    expect(scores.get('PLTR')?.distinctBuyers).toBe(3);
    expect(scores.get('AAPL')).toBeUndefined();  // only 1 buyer, no cluster
    expect(scores.get('NVDA')).toBeUndefined();
    expect(scores.get('TSLA')).toBeUndefined();
  });

  it('caps score at 1.0 even with many buyers', () => {
    const now = Math.floor(Date.now() / 1000);
    const rows = Array.from({ length: 10 }, (_, i) => ({
      id: `${i}`, ticker: 'BIG', insider_name: `Insider${i}`, code: 'P', is_derivative: 0,
      txn_date: '2026-05-10', filed_at: now - 86400,
    }));
    const scores = scoreInsiderClusters(rows as any, now, 30);
    expect(scores.get('BIG')!.score).toBe(1.0);
  });

  it('excludes events outside the lookback window', () => {
    const now = Math.floor(new Date('2026-05-13').getTime() / 1000);
    const rows = [
      { id: '1', ticker: 'OLD', insider_name: 'A', code: 'P', is_derivative: 0, txn_date: '2025-01-01', filed_at: now - 365 * 86400 },
      { id: '2', ticker: 'OLD', insider_name: 'B', code: 'P', is_derivative: 0, txn_date: '2025-01-02', filed_at: now - 364 * 86400 },
    ];
    expect(scoreInsiderClusters(rows as any, now, 30).size).toBe(0);
  });
});

describe('scoreCongressBuys', () => {
  it('counts distinct members buying within 14 days, weighted by kind', () => {
    const now = Math.floor(new Date('2026-05-13').getTime() / 1000);
    const day = 86400;
    const rows = [
      { id: '1', ticker: 'AAPL', member: 'Sen X', kind: 'Purchase', txn_date: '2026-05-05', disclosed_at: now - 5 * day },
      { id: '2', ticker: 'AAPL', member: 'Rep Y', kind: 'Purchase', txn_date: '2026-05-08', disclosed_at: now - 3 * day },
      { id: '3', ticker: 'NVDA', member: 'Sen Z', kind: 'Sale',     txn_date: '2026-05-10', disclosed_at: now - 1 * day },
    ];
    const s = scoreCongressBuys(rows as any, now, 14);
    expect(s.get('AAPL')!.buys).toBe(2);
    expect(s.get('AAPL')!.sales).toBe(0);
    expect(s.get('AAPL')!.score).toBeGreaterThan(0);
    expect(s.get('NVDA')!.buys).toBe(0);
    expect(s.get('NVDA')!.sales).toBe(1);
    expect(s.get('NVDA')!.score).toBe(0); // sale-only, no positive score
  });
});

describe('score13FAccumulation', () => {
  it('sums positive QoQ deltas for the most recent period', () => {
    const rows = [
      { ticker: 'AAPL', cik: 'F1', period_end: '2026-03-31', delta_shares: 1_000_000, value_usd: 1_000_000 },
      { ticker: 'AAPL', cik: 'F2', period_end: '2026-03-31', delta_shares: 500_000, value_usd: 500_000 },
      { ticker: 'AAPL', cik: 'F3', period_end: '2026-03-31', delta_shares: -200_000, value_usd: 200_000 },
      { ticker: 'NVDA', cik: 'F1', period_end: '2026-03-31', delta_shares: -100_000, value_usd: 100_000 },
    ];
    const s = score13FAccumulation(rows as any);
    // AAPL: 2 funds accumulated, 1 sold => only positive count = 2, normalised
    expect(s.get('AAPL')!.accumulators).toBe(2);
    expect(s.get('NVDA')).toBeUndefined();
  });
});

describe('scoreHaltEvents', () => {
  it('flags any halt in the lookback window with reason LULD', () => {
    const now = Math.floor(new Date('2026-05-13').getTime() / 1000);
    const rows = [
      { id: '1', ticker: 'ASRT', halt_date: '2026-05-12', halt_time: '07:55', reason_code: 'LUDP', fetched_at: now - 86400 },
      { id: '2', ticker: 'OLD',  halt_date: '2026-04-01', halt_time: '09:30', reason_code: 'LUDP', fetched_at: now - 45 * 86400 },
    ];
    const s = scoreHaltEvents(rows as any, now, 3);
    expect(s.get('ASRT')!.score).toBeGreaterThan(0);
    expect(s.get('OLD')).toBeUndefined();
  });
});

describe('aggregateScores', () => {
  it('combines signals with default equal weights', () => {
    const insider = new Map([['AAPL', { score: 0.8, distinctBuyers: 4 }]]);
    const congress = new Map([['AAPL', { score: 0.5, buys: 2, sales: 0 }]]);
    const funds = new Map();
    const halts = new Map();
    const agg = aggregateScores({ insider, congress, funds, halts }, DEFAULT_WEIGHTS);
    expect(agg[0].ticker).toBe('AAPL');
    expect(agg[0].score).toBeCloseTo((0.8 + 0.5) / 4, 4); // 4 signals total, but only 2 active
    expect(agg[0].signals).toHaveLength(2);
  });

  it('returns tickers sorted by score DESC', () => {
    const insider = new Map([['A', { score: 0.5, distinctBuyers: 2 }], ['B', { score: 0.9, distinctBuyers: 5 }]]);
    const congress = new Map();
    const funds = new Map();
    const halts = new Map();
    const agg = aggregateScores({ insider, congress, funds, halts }, DEFAULT_WEIGHTS);
    expect(agg.map(a => a.ticker)).toEqual(['B', 'A']);
  });

  it('respects custom weights (zero weight removes signal)', () => {
    const insider = new Map([['A', { score: 1.0, distinctBuyers: 5 }]]);
    const congress = new Map([['A', { score: 1.0, buys: 3, sales: 0 }]]);
    const funds = new Map();
    const halts = new Map();
    const agg = aggregateScores({ insider, congress, funds, halts }, { insider: 0, congress: 1, funds: 1, halts: 1 });
    // Only congress contributes
    expect(agg[0].signals.map(s => s.kind)).toEqual(['congress']);
  });
});
