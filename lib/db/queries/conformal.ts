import { getDb } from '@/lib/db/connection';

export type CqrPredRow = {
  date: string; ticker: string; horizon_days: number; alpha: number;
  q_lo: number; q_hi: number; point_pred: number;
  features_json: string; model_version: string; trained_at: number;
};

export type PredictionIntervalRow = {
  date: string; ticker: string; horizon_days: number; alpha: number;
  point_pred: number; lower: number; upper: number; pid_threshold: number;
  source_model_version: string; computed_at: number;
};

export type PidStateRow = {
  horizon_days: number; alpha: number;
  q_t: number; integral: number; prev_err: number;
  updates_count: number; empirical_coverage: number | null; updated_at: number;
};

export function upsertCqrPred(r: CqrPredRow): void {
  getDb().prepare(
    `INSERT OR REPLACE INTO cqr_quantile_preds
     (date, ticker, horizon_days, alpha, q_lo, q_hi, point_pred,
      features_json, model_version, trained_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(r.date, r.ticker, r.horizon_days, r.alpha, r.q_lo, r.q_hi, r.point_pred,
        r.features_json, r.model_version, r.trained_at);
}

export function getCqrPredsForDate(date: string, horizon_days: number): CqrPredRow[] {
  return getDb().prepare(
    `SELECT date, ticker, horizon_days, alpha, q_lo, q_hi, point_pred,
            features_json, model_version, trained_at
     FROM cqr_quantile_preds WHERE date = ? AND horizon_days = ?`
  ).all(date, horizon_days) as CqrPredRow[];
}

export function upsertPredictionInterval(r: PredictionIntervalRow): void {
  getDb().prepare(
    `INSERT OR REPLACE INTO prediction_intervals
     (date, ticker, horizon_days, alpha, point_pred, lower, upper,
      pid_threshold, source_model_version, computed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(r.date, r.ticker, r.horizon_days, r.alpha, r.point_pred, r.lower, r.upper,
        r.pid_threshold, r.source_model_version, r.computed_at);
}

export function getPredictionIntervalsForTicker(ticker: string): PredictionIntervalRow[] {
  return getDb().prepare(
    `SELECT date, ticker, horizon_days, alpha, point_pred, lower, upper,
            pid_threshold, source_model_version, computed_at
     FROM prediction_intervals WHERE ticker = ?
     ORDER BY computed_at DESC`
  ).all(ticker) as PredictionIntervalRow[];
}

/**
 * Returns the latest interval row per (horizon_days, alpha) for a ticker.
 * Used by the term-structure UI which only needs the freshest 4 rows.
 */
export function getLatestPredictionIntervalsForTicker(
  ticker: string,
): PredictionIntervalRow[] {
  return getDb().prepare(
    `SELECT date, ticker, horizon_days, alpha, point_pred, lower, upper,
            pid_threshold, source_model_version, computed_at
     FROM prediction_intervals
     WHERE ticker = ?
       AND (horizon_days, alpha, date) IN (
         SELECT horizon_days, alpha, MAX(date)
         FROM prediction_intervals
         WHERE ticker = ?
         GROUP BY horizon_days, alpha
       )
     ORDER BY horizon_days ASC`
  ).all(ticker, ticker) as PredictionIntervalRow[];
}

export function getAllPidStates(): PidStateRow[] {
  return getDb().prepare(
    `SELECT horizon_days, alpha, q_t, integral, prev_err,
            updates_count, empirical_coverage, updated_at
     FROM conformal_pid_state
     ORDER BY horizon_days ASC`
  ).all() as PidStateRow[];
}

export function getOrInitPidState(horizon_days: number, alpha: number): PidStateRow {
  const row = getDb().prepare(
    `SELECT horizon_days, alpha, q_t, integral, prev_err,
            updates_count, empirical_coverage, updated_at
     FROM conformal_pid_state WHERE horizon_days = ? AND alpha = ?`
  ).get(horizon_days, alpha) as PidStateRow | undefined;
  if (row) return row;
  return {
    horizon_days, alpha, q_t: 0, integral: 0, prev_err: 0,
    updates_count: 0, empirical_coverage: null, updated_at: 0,
  };
}

export function updatePidState(s: PidStateRow): void {
  getDb().prepare(
    `INSERT OR REPLACE INTO conformal_pid_state
     (horizon_days, alpha, q_t, integral, prev_err,
      updates_count, empirical_coverage, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(s.horizon_days, s.alpha, s.q_t, s.integral, s.prev_err,
        s.updates_count, s.empirical_coverage, s.updated_at);
}
