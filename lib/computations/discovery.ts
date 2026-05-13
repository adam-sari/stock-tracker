export type SignalKind = 'insider' | 'congress' | 'funds' | 'halts';

export type InsiderClusterScore = { score: number; distinctBuyers: number };
export type CongressScore = { score: number; buys: number; sales: number };
export type FundAccumulationScore = { score: number; accumulators: number };
export type HaltScore = { score: number; reasonCode: string };

export type SignalEntry = { kind: SignalKind; score: number; weight: number; detail: string };

export type DiscoveryScore = {
  ticker: string;
  score: number;            // 0..1
  signals: SignalEntry[];
};

export type Weights = { insider: number; congress: number; funds: number; halts: number };

export const DEFAULT_WEIGHTS: Weights = { insider: 1, congress: 1, funds: 1, halts: 1 };

const MAX_INSIDER_CLUSTER = 5;     // saturate at 5 distinct buyers
const MAX_CONGRESS_BUYERS = 4;     // saturate at 4 distinct members
const MAX_FUND_ACCUMULATORS = 10;  // saturate at 10 accumulating funds

type InsiderRow = { ticker: string; insider_name: string; code: string; is_derivative: number; filed_at: number };

export function scoreInsiderClusters(rows: InsiderRow[], now: number, lookbackDays: number): Map<string, InsiderClusterScore> {
  const cutoff = now - lookbackDays * 86400;
  const byTicker = new Map<string, Set<string>>();
  for (const r of rows) {
    if (r.code !== 'P') continue;
    if (r.is_derivative === 1) continue;
    if (r.filed_at < cutoff) continue;
    if (!byTicker.has(r.ticker)) byTicker.set(r.ticker, new Set());
    byTicker.get(r.ticker)!.add(r.insider_name);
  }
  const out = new Map<string, InsiderClusterScore>();
  for (const [ticker, buyers] of byTicker) {
    if (buyers.size < 2) continue;  // require cluster: 2+ distinct buyers
    out.set(ticker, {
      score: Math.min(1, buyers.size / MAX_INSIDER_CLUSTER),
      distinctBuyers: buyers.size,
    });
  }
  return out;
}

type CongressRow = { ticker: string; member: string; kind: string; disclosed_at: number };

export function scoreCongressBuys(rows: CongressRow[], now: number, lookbackDays: number): Map<string, CongressScore> {
  const cutoff = now - lookbackDays * 86400;
  const buyersByTicker = new Map<string, Set<string>>();
  const salesByTicker = new Map<string, Set<string>>();
  for (const r of rows) {
    if (r.disclosed_at < cutoff) continue;
    if (r.kind === 'Purchase') {
      if (!buyersByTicker.has(r.ticker)) buyersByTicker.set(r.ticker, new Set());
      buyersByTicker.get(r.ticker)!.add(r.member);
    } else if (r.kind === 'Sale') {
      if (!salesByTicker.has(r.ticker)) salesByTicker.set(r.ticker, new Set());
      salesByTicker.get(r.ticker)!.add(r.member);
    }
  }
  const out = new Map<string, CongressScore>();
  const tickers = new Set<string>([...buyersByTicker.keys(), ...salesByTicker.keys()]);
  for (const ticker of tickers) {
    const buys = buyersByTicker.get(ticker)?.size ?? 0;
    const sales = salesByTicker.get(ticker)?.size ?? 0;
    const score = buys === 0 ? 0 : Math.min(1, buys / MAX_CONGRESS_BUYERS);
    out.set(ticker, { score, buys, sales });
  }
  return out;
}

type FundRow = { ticker: string; cik: string; period_end: string; delta_shares: number | null };

export function score13FAccumulation(rows: FundRow[]): Map<string, FundAccumulationScore> {
  if (rows.length === 0) return new Map();
  // Use the most recent period_end across the input
  const latestPeriod = rows.reduce((max, r) => (r.period_end > max ? r.period_end : max), '');
  const counts = new Map<string, Set<string>>();
  for (const r of rows) {
    if (r.period_end !== latestPeriod) continue;
    if ((r.delta_shares ?? 0) <= 0) continue;
    if (!counts.has(r.ticker)) counts.set(r.ticker, new Set());
    counts.get(r.ticker)!.add(r.cik);
  }
  const out = new Map<string, FundAccumulationScore>();
  for (const [ticker, ciks] of counts) {
    if (ciks.size === 0) continue;
    out.set(ticker, {
      score: Math.min(1, ciks.size / MAX_FUND_ACCUMULATORS),
      accumulators: ciks.size,
    });
  }
  return out;
}

type HaltRow = { ticker: string; reason_code: string | null; fetched_at: number };

export function scoreHaltEvents(rows: HaltRow[], now: number, lookbackDays: number): Map<string, HaltScore> {
  const cutoff = now - lookbackDays * 86400;
  const out = new Map<string, HaltScore>();
  for (const r of rows) {
    if (r.fetched_at < cutoff) continue;
    // Any halt in window is a flag worth surfacing
    out.set(r.ticker, { score: 1.0, reasonCode: r.reason_code ?? '' });
  }
  return out;
}

export function aggregateScores(
  buckets: {
    insider: Map<string, InsiderClusterScore>;
    congress: Map<string, CongressScore>;
    funds: Map<string, FundAccumulationScore>;
    halts: Map<string, HaltScore>;
  },
  weights: Weights = DEFAULT_WEIGHTS,
): DiscoveryScore[] {
  const tickers = new Set<string>([
    ...buckets.insider.keys(),
    ...buckets.congress.keys(),
    ...buckets.funds.keys(),
    ...buckets.halts.keys(),
  ]);
  const totalWeight = Object.values(weights).reduce((s, w) => s + w, 0) || 1;

  const result: DiscoveryScore[] = [];
  for (const ticker of tickers) {
    const signals: SignalEntry[] = [];
    if (weights.insider > 0 && buckets.insider.has(ticker)) {
      const e = buckets.insider.get(ticker)!;
      signals.push({ kind: 'insider', score: e.score, weight: weights.insider, detail: `${e.distinctBuyers} insider${e.distinctBuyers === 1 ? '' : 's'} buying` });
    }
    if (weights.congress > 0 && buckets.congress.has(ticker)) {
      const e = buckets.congress.get(ticker)!;
      if (e.score > 0) {
        signals.push({ kind: 'congress', score: e.score, weight: weights.congress, detail: `${e.buys} member${e.buys === 1 ? '' : 's'} bought` });
      }
    }
    if (weights.funds > 0 && buckets.funds.has(ticker)) {
      const e = buckets.funds.get(ticker)!;
      signals.push({ kind: 'funds', score: e.score, weight: weights.funds, detail: `${e.accumulators} fund${e.accumulators === 1 ? '' : 's'} accumulated last quarter` });
    }
    if (weights.halts > 0 && buckets.halts.has(ticker)) {
      const e = buckets.halts.get(ticker)!;
      signals.push({ kind: 'halts', score: e.score, weight: weights.halts, detail: `recent halt (${e.reasonCode || '?'})` });
    }
    if (signals.length === 0) continue;
    const weightedSum = signals.reduce((s, sig) => s + sig.score * sig.weight, 0);
    result.push({ ticker, score: weightedSum / totalWeight, signals });
  }
  result.sort((a, b) => b.score - a.score);
  return result;
}
