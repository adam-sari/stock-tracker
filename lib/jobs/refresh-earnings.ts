import { getDb } from '../db/connection';
import { listHoldings } from '../db/queries/holdings';
import { upsertEarnings, type EarningsRow } from '../db/queries/earnings';
import type { FinnhubClient } from '../providers/finnhub';

export async function refreshEarningsOnce(finnhub: FinnhubClient): Promise<{ inserted: number }> {
  const db = getDb();
  const started = Math.floor(Date.now() / 1000);
  const job = db.prepare(`INSERT INTO job_runs (job, started_at, status) VALUES ('refresh_earnings', ?, 'running')`).run(started);

  let inserted = 0;
  let error: string | null = null;
  try {
    const from = new Date();
    const to = new Date(from.getTime() + 30 * 86400_000);
    const cal = await finnhub.getEarningsCalendar(from, to);
    const holdings = new Set(listHoldings().map(h => h.ticker.toUpperCase()));
    const rows: EarningsRow[] = cal
      .filter(e => holdings.has(e.symbol.toUpperCase()))
      .map(e => ({
        ticker: e.symbol,
        earnings_date: e.date,
        hour: e.hour || undefined,
        eps_estimate: e.epsEstimate ?? undefined,
        eps_actual: e.epsActual ?? undefined,
        revenue_estimate: e.revenueEstimate ?? undefined,
        revenue_actual: e.revenueActual ?? undefined,
        quarter: e.quarter,
        fiscal_year: e.year,
        source: 'finnhub',
      }));
    upsertEarnings(rows);
    inserted = rows.length;
  } catch (e) { error = (e as Error).message; }

  db.prepare(`UPDATE job_runs SET finished_at=?, status=?, detail=? WHERE id=?`)
    .run(Math.floor(Date.now() / 1000), error ? 'error' : 'ok', error ?? `inserted=${inserted}`, job.lastInsertRowid);
  return { inserted };
}
