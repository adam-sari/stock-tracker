import { describe, it, expect } from 'vitest';
import {
  scoreInsiderClusters,
  scoreCongressBuys,
  score13FAccumulation,
  scoreHaltEvents,
  scoreVolumeBreakout,
  scoreSentimentSurge,
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
    // DEFAULT_WEIGHTS has 6 signals (insider, congress, funds, halts, volume, sentiment) each weight=1
    expect(agg[0].score).toBeCloseTo((0.8 + 0.5) / 6, 4);
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
    const agg = aggregateScores({ insider, congress, funds, halts }, { insider: 0, congress: 1, funds: 1, halts: 1, volume: 1, sentiment: 1 });
    // Only congress contributes
    expect(agg[0].signals.map(s => s.kind)).toEqual(['congress']);
  });
});

describe('scoreVolumeBreakout', () => {
  function makeCandles(ticker: string, volumes: number[], baseDate = '2026-05-01') {
    return volumes.map((volume, i) => {
      const d = new Date(baseDate);
      d.setDate(d.getDate() + i);
      return { ticker, date: d.toISOString().slice(0, 10), volume };
    });
  }

  it('signals a breakout when latest volume is more than 2x the prior average', () => {
    // 30 prior days at 1_000_000, then a breakout day at 5_000_000 (5x)
    const rows = makeCandles('PLTR', [...Array(30).fill(1_000_000), 5_000_000]);
    const scores = scoreVolumeBreakout(rows, 30);
    const entry = scores.get('PLTR');
    expect(entry).toBeDefined();
    // ratio = 5.0 => score = min(1, (5-1)/4) = 1.0
    expect(entry!.score).toBe(1.0);
    expect(entry!.latestVolume).toBe(5_000_000);
    expect(entry!.avgPriorVolume).toBeCloseTo(1_000_000, 0);
  });

  it('does not signal when latest volume is at or below 2x average', () => {
    // 10 prior days at 1_000_000, then 1_800_000 (1.8x — below threshold)
    const rows = makeCandles('AAPL', [...Array(10).fill(1_000_000), 1_800_000]);
    const scores = scoreVolumeBreakout(rows, 30);
    expect(scores.get('AAPL')).toBeUndefined();
  });

  it('score is capped at 1.0 for extreme volume spikes', () => {
    const rows = makeCandles('TSLA', [...Array(10).fill(100_000), 10_000_000]);
    const scores = scoreVolumeBreakout(rows, 30);
    expect(scores.get('TSLA')!.score).toBe(1.0);
  });

  it('returns empty map when there is only one candle per ticker', () => {
    const rows = [{ ticker: 'SOLO', date: '2026-05-14', volume: 999_999 }];
    expect(scoreVolumeBreakout(rows, 30).size).toBe(0);
  });
});

describe('scoreSentimentSurge', () => {
  const now = Math.floor(new Date('2026-05-14T12:00:00Z').getTime() / 1000);

  it('signals a surge when latest mentions is more than 2x mentions_24h_ago', () => {
    const rows = [
      // GME: 3x surge within the last 24h
      { ticker: 'GME', ts: now - 3600, mentions: 3000, mentions_24h_ago: 1000 },
    ];
    // Override Date.now used internally by providing fresh rows
    const scores = scoreSentimentSurge(rows, 48);
    const entry = scores.get('GME');
    expect(entry).toBeDefined();
    // ratio = 3 => score = min(1, (3-1)/5) = 0.4
    expect(entry!.score).toBeCloseTo(0.4, 4);
    expect(entry!.latestMentions).toBe(3000);
    expect(entry!.surgePct).toBeCloseTo(200, 0);
  });

  it('does not signal when mentions are below 2x threshold', () => {
    const rows = [{ ticker: 'SPY', ts: now - 3600, mentions: 1500, mentions_24h_ago: 1000 }];
    const scores = scoreSentimentSurge(rows, 48);
    expect(scores.get('SPY')).toBeUndefined();
  });

  it('caps score at 1.0 for extreme mention surges (11x)', () => {
    const rows = [{ ticker: 'MOON', ts: now - 100, mentions: 11000, mentions_24h_ago: 1000 }];
    const scores = scoreSentimentSurge(rows, 48);
    // ratio = 11 => (11-1)/5 = 2.0 => capped at 1.0
    expect(scores.get('MOON')!.score).toBe(1.0);
  });

  it('picks the latest snapshot when multiple snapshots exist for same ticker', () => {
    const rows = [
      { ticker: 'AMC', ts: now - 7200, mentions: 5000, mentions_24h_ago: 1000 },  // older, higher surge
      { ticker: 'AMC', ts: now - 1800, mentions: 2100, mentions_24h_ago: 1000 },  // newer, lower surge
    ];
    const scores = scoreSentimentSurge(rows, 48);
    // Should use the newer snapshot (ts = now - 1800)
    expect(scores.get('AMC')!.latestMentions).toBe(2100);
  });

  it('ignores rows outside the lookback window', () => {
    const rows = [{ ticker: 'OLD', ts: now - 100 * 3600, mentions: 9000, mentions_24h_ago: 100 }];
    const scores = scoreSentimentSurge(rows, 24);
    expect(scores.get('OLD')).toBeUndefined();
  });

  it('skips rows with null or zero mentions_24h_ago', () => {
    const rows = [
      { ticker: 'NEW', ts: now - 100, mentions: 5000, mentions_24h_ago: null },
      { ticker: 'ZERO', ts: now - 100, mentions: 5000, mentions_24h_ago: 0 },
    ];
    const scores = scoreSentimentSurge(rows, 48);
    expect(scores.get('NEW')).toBeUndefined();
    expect(scores.get('ZERO')).toBeUndefined();
  });
});
