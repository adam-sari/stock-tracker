import type Database from 'better-sqlite3';
import { applyPidStep, DEFAULT_GAINS } from '@/lib/conformal/pid';
import { perHorizonAlpha } from '@/lib/conformal/bonferroni';
import {
  getOrInitPidState, updatePidState, upsertPredictionInterval,
} from '@/lib/db/queries/conformal';

const HORIZONS = [1, 5, 21, 63] as const;
const JOINT_ALPHA = 0.10;

export type Opts = { horizons?: readonly number[]; jointAlpha?: number };

export async function backfillConformalHistory(
  db: Database.Database, opts: Opts = {},
): Promise<number> {
  const horizons = opts.horizons ?? HORIZONS;
  const jointAlpha = opts.jointAlpha ?? JOINT_ALPHA;
  const k = horizons.length;
  const alphaTarget = perHorizonAlpha(jointAlpha, k);
  let totalWritten = 0;

  for (const h of horizons) {
    const stateRow = getOrInitPidState(h, jointAlpha);
    if (stateRow.updates_count > 0) {
      throw new Error(
        `pid_state for h=${h} already has ${stateRow.updates_count} updates. ` +
        `Reset conformal_pid_state before re-running backfill.`
      );
    }
    let algo = {
      q_t: stateRow.q_t, integral: stateRow.integral, prev_err: stateRow.prev_err,
      updates_count: stateRow.updates_count, empirical_coverage: stateRow.empirical_coverage,
    };

    const pairs = db.prepare(
      `SELECT c.date AS date, c.ticker AS ticker, c.q_lo AS q_lo, c.q_hi AS q_hi,
              c.point_pred AS point_pred, c.model_version AS source_model_version,
              r.spy_excess_pct AS realized, r.computed_at AS computed_at
       FROM cqr_quantile_preds c
       JOIN realized_returns r ON r.date = c.date AND r.ticker = c.ticker
         AND r.horizon_days = c.horizon_days AND r.status = 'computed'
         AND r.spy_excess_pct IS NOT NULL
       WHERE c.horizon_days = ? AND c.alpha = ?
       ORDER BY c.date ASC, c.ticker ASC`
    ).all(h, jointAlpha) as Array<any>;

    const now = Math.floor(Date.now() / 1000);
    let maxCursor = stateRow.updated_at;

    console.log(`h=${h}: processing ${pairs.length} pairs…`);
    db.transaction(() => {
      for (const p of pairs) {
        const score = Math.max(p.q_lo - p.realized, p.realized - p.q_hi);
        algo = applyPidStep(algo, { score, alphaTarget }, DEFAULT_GAINS);
        maxCursor = Math.max(maxCursor, p.computed_at);
        upsertPredictionInterval({
          date: p.date, ticker: p.ticker, horizon_days: h, alpha: jointAlpha,
          point_pred: p.point_pred,
          lower: p.q_lo - algo.q_t, upper: p.q_hi + algo.q_t,
          pid_threshold: algo.q_t,
          source_model_version: p.source_model_version,
          computed_at: now,
        });
        totalWritten++;
      }
      updatePidState({
        horizon_days: h, alpha: jointAlpha,
        q_t: algo.q_t, integral: algo.integral, prev_err: algo.prev_err,
        updates_count: algo.updates_count, empirical_coverage: algo.empirical_coverage,
        updated_at: maxCursor,
      });
    })();
    console.log(`h=${h}: done, q_t=${algo.q_t.toFixed(4)}, updates=${algo.updates_count}`);
  }

  return totalWritten;
}

if (require.main === module) {
  (async () => {
    const { getDb } = await import('@/lib/db/connection');
    const n = await backfillConformalHistory(getDb());
    console.log(`backfilled ${n} prediction_intervals rows`);
  })().catch(e => { console.error(e); process.exit(1); });
}
