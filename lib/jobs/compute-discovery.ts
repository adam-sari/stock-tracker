import { getDb } from '../db/connection';
import { listHoldings } from '../db/queries/holdings';
import {
  scoreInsiderClusters, scoreCongressBuys, score13FAccumulation, scoreHaltEvents,
  aggregateScores, DEFAULT_WEIGHTS,
} from '../computations/discovery';
import { upsertDiscoveryScore, clearStaleDiscoveryScores } from '../db/queries/discovery';

const INSIDER_LOOKBACK_DAYS = 30;
const CONGRESS_LOOKBACK_DAYS = 14;
const HALT_LOOKBACK_DAYS = 3;

export async function computeDiscoveryOnce(): Promise<{ scored: number }> {
  const db = getDb();
  const started = Math.floor(Date.now() / 1000);
  const job = db.prepare(`INSERT INTO job_runs (job, started_at, status) VALUES ('compute_discovery', ?, 'running')`).run(started);

  let scored = 0;
  let error: string | null = null;
  try {
    const now = Math.floor(Date.now() / 1000);
    // Held tickers are excluded
    const holdings = new Set(listHoldings().map(h => h.ticker.toUpperCase()));

    const insiderRows = db.prepare(`SELECT ticker, insider_name, code, is_derivative, filed_at FROM insider_txns WHERE filed_at >= ?`).all(now - 60 * 86400) as Array<{ ticker: string; insider_name: string; code: string; is_derivative: number; filed_at: number }>;
    const congressRows = db.prepare(`SELECT ticker, member, kind, disclosed_at FROM congress_trades WHERE disclosed_at >= ?`).all(now - 30 * 86400) as Array<{ ticker: string; member: string; kind: string; disclosed_at: number }>;
    const fundRows = db.prepare(`SELECT ticker, cik, period_end, delta_shares FROM fund_holdings`).all() as Array<{ ticker: string; cik: string; period_end: string; delta_shares: number | null }>;
    const haltRows = db.prepare(`SELECT ticker, reason_code, fetched_at FROM trading_halts WHERE fetched_at >= ?`).all(now - 7 * 86400) as Array<{ ticker: string; reason_code: string | null; fetched_at: number }>;

    const buckets = {
      insider: scoreInsiderClusters(insiderRows, now, INSIDER_LOOKBACK_DAYS),
      congress: scoreCongressBuys(congressRows, now, CONGRESS_LOOKBACK_DAYS),
      funds: score13FAccumulation(fundRows),
      halts: scoreHaltEvents(haltRows, now, HALT_LOOKBACK_DAYS),
    };

    const aggregated = aggregateScores(buckets, DEFAULT_WEIGHTS);
    const computed_at = now;

    // Clear stale (older than 2 days) before insert to keep table tidy
    clearStaleDiscoveryScores(now - 2 * 86400);

    for (const r of aggregated) {
      if (holdings.has(r.ticker)) continue;
      upsertDiscoveryScore({
        ticker: r.ticker,
        score: r.score,
        signals_json: JSON.stringify(r.signals),
        computed_at,
      });
      scored++;
    }
  } catch (e) { error = (e as Error).message; }

  db.prepare(`UPDATE job_runs SET finished_at=?, status=?, detail=? WHERE id=?`)
    .run(Math.floor(Date.now() / 1000), error ? 'error' : 'ok', error ?? `scored=${scored}`, job.lastInsertRowid);
  return { scored };
}
