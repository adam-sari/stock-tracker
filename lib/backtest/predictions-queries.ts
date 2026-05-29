import type Database from 'better-sqlite3';

export type PredictionRow = {
  date: string;
  ticker: string;
  signal_kind: string;
  score: number;
  return_1d: number | null;  spy_excess_1d: number | null;
  return_5d: number | null;  spy_excess_5d: number | null;
  return_21d: number | null; spy_excess_21d: number | null;
  return_63d: number | null; spy_excess_63d: number | null;
};

export type ListOpts = {
  signalKind?: string;
  minScore?: number;
  limit?: number;
  orderBy?: 'score' | 'date';
};

export type HitRate = {
  n: number;
  hits: number;
  hitRate: number;
  meanReturn: number;
  meanSpyExcess: number;
};

const PIVOTED_RETURNS_CTE = `
  WITH r AS (
    SELECT date, ticker,
      MAX(CASE WHEN horizon_days = 1  AND status = 'computed' THEN return_pct END)      AS return_1d,
      MAX(CASE WHEN horizon_days = 1  AND status = 'computed' THEN spy_excess_pct END)  AS spy_excess_1d,
      MAX(CASE WHEN horizon_days = 5  AND status = 'computed' THEN return_pct END)      AS return_5d,
      MAX(CASE WHEN horizon_days = 5  AND status = 'computed' THEN spy_excess_pct END)  AS spy_excess_5d,
      MAX(CASE WHEN horizon_days = 21 AND status = 'computed' THEN return_pct END)      AS return_21d,
      MAX(CASE WHEN horizon_days = 21 AND status = 'computed' THEN spy_excess_pct END)  AS spy_excess_21d,
      MAX(CASE WHEN horizon_days = 63 AND status = 'computed' THEN return_pct END)      AS return_63d,
      MAX(CASE WHEN horizon_days = 63 AND status = 'computed' THEN spy_excess_pct END)  AS spy_excess_63d
    FROM realized_returns
    GROUP BY date, ticker
  )
`;

export function listPredictionsWithReturns(db: Database.Database, opts: ListOpts): PredictionRow[] {
  const where: string[] = [];
  const params: Array<string | number> = [];
  if (opts.signalKind !== undefined) {
    where.push('bs.signal_kind = ?');
    params.push(opts.signalKind);
  }
  if (opts.minScore !== undefined) {
    where.push('bs.score >= ?');
    params.push(opts.minScore);
  }
  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const orderClause = opts.orderBy === 'date'
    ? 'ORDER BY bs.date DESC, bs.score DESC'
    : 'ORDER BY bs.score DESC, bs.date DESC';
  const limitClause = opts.limit !== undefined ? `LIMIT ${Math.max(0, Math.floor(opts.limit))}` : '';

  return db.prepare(`
    ${PIVOTED_RETURNS_CTE}
    SELECT
      bs.date AS date,
      bs.ticker AS ticker,
      bs.signal_kind AS signal_kind,
      bs.score AS score,
      r.return_1d, r.spy_excess_1d,
      r.return_5d, r.spy_excess_5d,
      r.return_21d, r.spy_excess_21d,
      r.return_63d, r.spy_excess_63d
    FROM backtest_scores bs
    LEFT JOIN r ON r.date = bs.date AND r.ticker = bs.ticker
    ${whereClause}
    ${orderClause}
    ${limitClause}
  `).all(...params) as PredictionRow[];
}

export type PredictionWithPIRow = {
  date: string; ticker: string; signal_kind: string; score: number;
  return_1d: number | null;  spy_excess_1d: number | null;
  return_5d: number | null;  spy_excess_5d: number | null;
  return_21d: number | null; spy_excess_21d: number | null;
  return_63d: number | null; spy_excess_63d: number | null;
  lower_21d: number | null; upper_21d: number | null;
  in_pi_21d: boolean | null;
};

const PIVOTED_RETURNS_WITH_PI_CTE = `
  WITH r AS (
    SELECT date, ticker,
      MAX(CASE WHEN horizon_days = 1  AND status = 'computed' THEN return_pct END)      AS return_1d,
      MAX(CASE WHEN horizon_days = 1  AND status = 'computed' THEN spy_excess_pct END)  AS spy_excess_1d,
      MAX(CASE WHEN horizon_days = 5  AND status = 'computed' THEN return_pct END)      AS return_5d,
      MAX(CASE WHEN horizon_days = 5  AND status = 'computed' THEN spy_excess_pct END)  AS spy_excess_5d,
      MAX(CASE WHEN horizon_days = 21 AND status = 'computed' THEN return_pct END)      AS return_21d,
      MAX(CASE WHEN horizon_days = 21 AND status = 'computed' THEN spy_excess_pct END)  AS spy_excess_21d,
      MAX(CASE WHEN horizon_days = 63 AND status = 'computed' THEN return_pct END)      AS return_63d,
      MAX(CASE WHEN horizon_days = 63 AND status = 'computed' THEN spy_excess_pct END)  AS spy_excess_63d
    FROM realized_returns
    GROUP BY date, ticker
  )
`;

export function listPredictionsWithPI(
  db: Database.Database, opts: ListOpts,
): PredictionWithPIRow[] {
  const where: string[] = [];
  const params: Array<string | number> = [];
  if (opts.signalKind !== undefined) {
    where.push('bs.signal_kind = ?');
    params.push(opts.signalKind);
  }
  if (opts.minScore !== undefined) {
    where.push('bs.score >= ?');
    params.push(opts.minScore);
  }
  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const limit = opts.limit !== undefined ? `LIMIT ${Math.max(0, Math.floor(opts.limit))}` : '';

  const rows = db.prepare(`
    ${PIVOTED_RETURNS_WITH_PI_CTE}
    SELECT bs.date AS date, bs.ticker AS ticker, bs.signal_kind AS signal_kind,
           bs.score AS score,
           r.return_1d,  r.spy_excess_1d,
           r.return_5d,  r.spy_excess_5d,
           r.return_21d, r.spy_excess_21d,
           r.return_63d, r.spy_excess_63d,
           pi.lower AS lower_21d, pi.upper AS upper_21d
    FROM backtest_scores bs
    LEFT JOIN r ON r.date = bs.date AND r.ticker = bs.ticker
    LEFT JOIN prediction_intervals pi
      ON pi.date = bs.date AND pi.ticker = bs.ticker
         AND pi.horizon_days = 21 AND pi.alpha = 0.10
    ${whereClause}
    ORDER BY bs.date DESC, bs.score DESC
    ${limit}
  `).all(...params) as Array<any>;

  return rows.map(r => ({
    date: r.date, ticker: r.ticker, signal_kind: r.signal_kind, score: r.score,
    return_1d: r.return_1d, spy_excess_1d: r.spy_excess_1d,
    return_5d: r.return_5d, spy_excess_5d: r.spy_excess_5d,
    return_21d: r.return_21d, spy_excess_21d: r.spy_excess_21d,
    return_63d: r.return_63d, spy_excess_63d: r.spy_excess_63d,
    lower_21d: r.lower_21d, upper_21d: r.upper_21d,
    in_pi_21d:
      r.lower_21d === null || r.upper_21d === null || r.spy_excess_21d === null
        ? null
        : r.spy_excess_21d >= r.lower_21d && r.spy_excess_21d <= r.upper_21d,
  }));
}

export function computeHitRate(
  db: Database.Database,
  opts: { horizon: number; minScore: number; signalKind?: string }
): HitRate {
  const where: string[] = ['rr.horizon_days = ?', "rr.status = 'computed'", 'bs.score >= ?'];
  const params: Array<string | number> = [opts.horizon, opts.minScore];
  if (opts.signalKind !== undefined) {
    where.push('bs.signal_kind = ?');
    params.push(opts.signalKind);
  }
  const row = db.prepare(`
    SELECT
      COUNT(*) AS n,
      SUM(CASE WHEN rr.spy_excess_pct > 0 THEN 1 ELSE 0 END) AS hits,
      AVG(rr.return_pct) AS mean_return,
      AVG(rr.spy_excess_pct) AS mean_spy_excess
    FROM realized_returns rr
    JOIN backtest_scores bs
      ON bs.date = rr.date AND bs.ticker = rr.ticker
    WHERE ${where.join(' AND ')}
  `).get(...params) as { n: number; hits: number | null; mean_return: number | null; mean_spy_excess: number | null };

  const n = row.n ?? 0;
  const hits = row.hits ?? 0;
  return {
    n,
    hits,
    hitRate: n > 0 ? hits / n : 0,
    meanReturn: row.mean_return ?? 0,
    meanSpyExcess: row.mean_spy_excess ?? 0,
  };
}
