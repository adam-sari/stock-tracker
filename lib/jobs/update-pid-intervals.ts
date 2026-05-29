import type Database from 'better-sqlite3';
import { applyPidStep, DEFAULT_GAINS } from '@/lib/conformal/pid';
import { perHorizonAlpha } from '@/lib/conformal/bonferroni';
import {
  getOrInitPidState, updatePidState, upsertPredictionInterval,
} from '@/lib/db/queries/conformal';
import type { PidState } from '@/lib/conformal/types';

export const HORIZONS = [1, 5, 21, 63] as const;
export const JOINT_ALPHA = 0.10;

export type RunOpts = { horizons?: readonly number[]; jointAlpha?: number };

type Pair = {
  date: string;
  ticker: string;
  q_lo: number;
  q_hi: number;
  point_pred: number;
  realized: number;
  source_model_version: string;
  computed_at: number;
};

function loadPairs(db: Database.Database, horizon: number, jointAlpha: number,
                   sinceUpdateAt: number): Pair[] {
  return db.prepare(
    `SELECT
       c.date AS date, c.ticker AS ticker,
       c.q_lo AS q_lo, c.q_hi AS q_hi, c.point_pred AS point_pred,
       r.spy_excess_pct AS realized,
       c.model_version AS source_model_version,
       r.computed_at AS computed_at
     FROM cqr_quantile_preds c
     JOIN realized_returns r
       ON r.date = c.date AND r.ticker = c.ticker AND r.horizon_days = c.horizon_days
     WHERE c.horizon_days = ? AND c.alpha = ?
       AND r.status = 'computed' AND r.spy_excess_pct IS NOT NULL
       AND r.computed_at > ?
     ORDER BY r.computed_at ASC`
  ).all(horizon, jointAlpha, sinceUpdateAt) as Pair[];
}

export async function runPidIntervalUpdate(
  db: Database.Database, opts: RunOpts = {},
): Promise<number> {
  const horizons = opts.horizons ?? HORIZONS;
  const jointAlpha = opts.jointAlpha ?? JOINT_ALPHA;
  const k = horizons.length;
  const alphaTarget = perHorizonAlpha(jointAlpha, k);
  const now = Math.floor(Date.now() / 1000);
  let totalWritten = 0;

  for (const h of horizons) {
    const row = getOrInitPidState(h, jointAlpha);
    let algo: PidState = {
      q_t: row.q_t, integral: row.integral, prev_err: row.prev_err,
      updates_count: row.updates_count, empirical_coverage: row.empirical_coverage,
    };

    const pairs = loadPairs(db, h, jointAlpha, row.updated_at);
    if (pairs.length === 0) continue;

    for (const p of pairs) {
      const score = Math.max(p.q_lo - p.realized, p.realized - p.q_hi);
      algo = applyPidStep(algo, { score, alphaTarget }, DEFAULT_GAINS);
    }

    // Recompute today's PIs using the freshly-updated threshold.
    const latestDate = (db.prepare(
      `SELECT MAX(date) AS d FROM cqr_quantile_preds WHERE horizon_days = ? AND alpha = ?`
    ).get(h, jointAlpha) as any).d as string | null;

    // Cursor advances to the latest realized.computed_at we processed so the
    // next nightly run picks up only strictly-newer rows (idempotent).
    const nextCursor = Math.max(...pairs.map(p => p.computed_at));

    db.transaction(() => {
      if (latestDate) {
        const todayRows = db.prepare(
          `SELECT date, ticker, q_lo, q_hi, point_pred, model_version
           FROM cqr_quantile_preds
           WHERE horizon_days = ? AND alpha = ? AND date = ?`
        ).all(h, jointAlpha, latestDate) as Array<any>;
        for (const r of todayRows) {
          upsertPredictionInterval({
            date: r.date, ticker: r.ticker, horizon_days: h, alpha: jointAlpha,
            point_pred: r.point_pred,
            lower: r.q_lo - algo.q_t,
            upper: r.q_hi + algo.q_t,
            pid_threshold: algo.q_t,
            source_model_version: r.model_version,
            computed_at: now,
          });
          totalWritten++;
        }
      }
      updatePidState({
        horizon_days: h, alpha: jointAlpha,
        q_t: algo.q_t, integral: algo.integral, prev_err: algo.prev_err,
        updates_count: algo.updates_count, empirical_coverage: algo.empirical_coverage,
        updated_at: nextCursor,
      });
    })();
  }

  return totalWritten;
}
