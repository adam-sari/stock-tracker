import type Database from 'better-sqlite3';

export type RealizedReturnStatus = 'pending' | 'no_entry_candle' | 'delisted' | 'computed';

export type RealizedReturnRow = {
  date: string;
  ticker: string;
  horizon_days: number;
  return_pct: number | null;
  spy_excess_pct: number | null;
  status: RealizedReturnStatus;
  computed_at: number;
};

export function getRealizedReturn(
  db: Database.Database, date: string, ticker: string, horizon: number
): RealizedReturnRow | null {
  const row = db.prepare(
    `SELECT date, ticker, horizon_days, return_pct, spy_excess_pct, status, computed_at
     FROM realized_returns
     WHERE date = ? AND ticker = ? AND horizon_days = ?`
  ).get(date, ticker, horizon) as RealizedReturnRow | undefined;
  return row ?? null;
}

export function insertRealizedReturns(db: Database.Database, rows: RealizedReturnRow[]): void {
  if (rows.length === 0) return;
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO realized_returns
       (date, ticker, horizon_days, return_pct, spy_excess_pct, status, computed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const insertAll = db.transaction((batch: RealizedReturnRow[]) => {
    for (const r of batch) {
      stmt.run(r.date, r.ticker, r.horizon_days, r.return_pct, r.spy_excess_pct, r.status, r.computed_at);
    }
  });
  insertAll(rows);
}

function buildHorizonUnion(horizons: number[]): { sql: string; params: number[] } {
  const parts = horizons.map(() => 'SELECT ? AS horizon');
  return { sql: parts.join(' UNION '), params: [...horizons] };
}

export function listMissingReturnsForBacktestScores(
  db: Database.Database, horizons: number[]
): Array<{ date: string; ticker: string; horizon: number }> {
  if (horizons.length === 0) return [];
  const { sql: horizonsCte, params } = buildHorizonUnion(horizons);
  return db.prepare(`
    SELECT DISTINCT bs.date AS date, bs.ticker AS ticker, h.horizon AS horizon
    FROM backtest_scores bs
    CROSS JOIN (${horizonsCte}) h
    LEFT JOIN realized_returns rr
      ON rr.date = bs.date AND rr.ticker = bs.ticker AND rr.horizon_days = h.horizon
    WHERE rr.date IS NULL
      AND EXISTS (SELECT 1 FROM candles_daily cd WHERE cd.date = bs.date LIMIT 1)
  `).all(...params) as Array<{ date: string; ticker: string; horizon: number }>;
}

export function listIncompleteReturnsToRetry(
  db: Database.Database, horizons: number[]
): Array<{ date: string; ticker: string; horizon: number }> {
  if (horizons.length === 0) return [];
  const placeholders = horizons.map(() => '?').join(',');
  return db.prepare(`
    WITH max_cd AS (SELECT MAX(date) AS d FROM candles_daily)
    SELECT rr.date AS date, rr.ticker AS ticker, rr.horizon_days AS horizon
    FROM realized_returns rr
    CROSS JOIN max_cd
    WHERE rr.status = 'pending'
      AND rr.horizon_days IN (${placeholders})
      AND date(rr.date, '+' || rr.horizon_days || ' day') <= max_cd.d
  `).all(...horizons) as Array<{ date: string; ticker: string; horizon: number }>;
}
