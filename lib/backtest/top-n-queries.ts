import type Database from 'better-sqlite3';

export type TopNRow = {
  ticker: string;
  value: number;
  detail: string;
};

/**
 * Top tickers by sum of `score` across all signals within the last `days` days.
 */
export function topByCompositeScore(db: Database.Database, days: number, n: number): TopNRow[] {
  const rows = db.prepare(`
    SELECT ticker,
           SUM(score) AS value,
           (SELECT signal_kind FROM backtest_scores
              WHERE ticker = outer_bs.ticker AND date >= date('now', '-' || ? || ' day')
              GROUP BY signal_kind ORDER BY SUM(score) DESC LIMIT 1) AS detail
    FROM backtest_scores AS outer_bs
    WHERE date >= date('now', '-' || ? || ' day')
    GROUP BY ticker
    ORDER BY value DESC
    LIMIT ?
  `).all(days, days, n) as Array<{ ticker: string; value: number; detail: string | null }>;
  return rows.map(r => ({ ticker: r.ticker, value: r.value, detail: r.detail ?? '' }));
}

/**
 * Top tickers by count of distinct signal_kinds with positive score in the window.
 */
export function topByMostSignals(db: Database.Database, days: number, n: number): TopNRow[] {
  const rows = db.prepare(`
    SELECT ticker,
           COUNT(DISTINCT signal_kind) AS value,
           GROUP_CONCAT(DISTINCT signal_kind) AS detail
    FROM backtest_scores
    WHERE date >= date('now', '-' || ? || ' day')
      AND score > 0
    GROUP BY ticker
    ORDER BY value DESC, SUM(score) DESC
    LIMIT ?
  `).all(days, n) as Array<{ ticker: string; value: number; detail: string | null }>;
  return rows.map(r => ({ ticker: r.ticker, value: r.value, detail: r.detail ?? '' }));
}

/**
 * Top tickers by score acceleration: sum(last `days`) - sum(prior `days`).
 */
export function topByAcceleration(db: Database.Database, days: number, n: number): TopNRow[] {
  const rows = db.prepare(`
    WITH last_window AS (
      SELECT ticker, SUM(score) AS s
      FROM backtest_scores
      WHERE date >= date('now', '-' || ? || ' day')
      GROUP BY ticker
    ),
    prior_window AS (
      SELECT ticker, SUM(score) AS s
      FROM backtest_scores
      WHERE date >= date('now', '-' || (? * 2) || ' day')
        AND date <  date('now', '-' || ? || ' day')
      GROUP BY ticker
    )
    SELECT
      COALESCE(lw.ticker, pw.ticker) AS ticker,
      COALESCE(lw.s, 0) - COALESCE(pw.s, 0) AS value
    FROM last_window lw
    FULL OUTER JOIN prior_window pw ON lw.ticker = pw.ticker
    ORDER BY value DESC
    LIMIT ?
  `).all(days, days, days, n) as Array<{ ticker: string; value: number }>;
  return rows.map(r => ({
    ticker: r.ticker,
    value: r.value,
    detail: r.value > 0 ? `+${r.value.toFixed(2)}` : r.value.toFixed(2),
  }));
}
