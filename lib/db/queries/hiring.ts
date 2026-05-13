import { getDb } from '../connection';

export type HiringSnapshot = {
  ticker: string;
  ts: number;
  ats: string;
  open_jobs: number;
};

/** Upsert a hiring snapshot (keyed on ticker + ts). */
export function upsertHiringSnapshot(row: HiringSnapshot): void {
  getDb().prepare(`
    INSERT INTO hiring_snapshots (ticker, ts, ats, open_jobs)
    VALUES (@ticker, @ts, @ats, @open_jobs)
    ON CONFLICT (ticker, ts) DO UPDATE SET
      ats = excluded.ats,
      open_jobs = excluded.open_jobs
  `).run({ ...row, ticker: row.ticker.toUpperCase() });
}

/** Latest hiring snapshot for a ticker. */
export function latestHiringSnapshot(ticker: string): HiringSnapshot | null {
  const row = getDb()
    .prepare(`SELECT * FROM hiring_snapshots WHERE ticker = ? ORDER BY ts DESC LIMIT 1`)
    .get(ticker.toUpperCase());
  return (row as HiringSnapshot | undefined) ?? null;
}

export type HiringTrend = {
  latest: number;
  prior7: number | null;
  deltaPct: number | null;
  ats: string;
};

/**
 * Compute hiring trend: compare most recent snapshot vs snapshot ~7 days prior.
 * Returns null when fewer than 2 snapshots exist.
 */
export function hiringTrend(ticker: string): HiringTrend | null {
  const rows = getDb()
    .prepare(`
      SELECT ts, open_jobs, ats
      FROM hiring_snapshots
      WHERE ticker = ?
      ORDER BY ts DESC
      LIMIT 10
    `)
    .all(ticker.toUpperCase()) as Array<{ ts: number; open_jobs: number; ats: string }>;

  if (rows.length === 0) return null;

  const latest = rows[0];
  const sevenDaysAgo = latest.ts - 7 * 86400;

  // Find snapshot closest to 7 days ago (within ±3 days tolerance)
  const priorCandidates = rows.slice(1).filter(
    r => Math.abs(r.ts - sevenDaysAgo) < 3 * 86400,
  );
  const prior = priorCandidates.length > 0
    ? priorCandidates.reduce((closest, r) =>
        Math.abs(r.ts - sevenDaysAgo) < Math.abs(closest.ts - sevenDaysAgo) ? r : closest
      )
    : null;

  const deltaPct =
    prior && prior.open_jobs > 0
      ? ((latest.open_jobs - prior.open_jobs) / prior.open_jobs) * 100
      : null;

  return {
    latest: latest.open_jobs,
    prior7: prior?.open_jobs ?? null,
    deltaPct,
    ats: latest.ats,
  };
}
