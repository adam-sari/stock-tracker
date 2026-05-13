import { getDb } from '../db/connection';
import { listHoldings } from '../db/queries/holdings';
import { upsertHiringSnapshot } from '../db/queries/hiring';
import { HiringClient, TECH_ATS_MAP } from '../providers/hiring';

export async function refreshHiringOnce(
  client: HiringClient = new HiringClient(),
): Promise<{ tickers: number; stored: number }> {
  const db = getDb();
  const started = Math.floor(Date.now() / 1000);
  const job = db
    .prepare(`INSERT INTO job_runs (job, started_at, status) VALUES ('refresh_hiring', ?, 'running')`)
    .run(started);

  let tickerCount = 0;
  let storedCount = 0;
  let error: string | null = null;

  try {
    // Build universe: held + watched tickers
    const holdings = listHoldings();
    const watchRows = db.prepare(`SELECT ticker FROM watchlist`).all() as Array<{ ticker: string }>;
    const universe = new Set<string>([
      ...holdings.map(h => h.ticker.toUpperCase()),
      ...watchRows.map(w => w.ticker.toUpperCase()),
    ]);

    // Filter to tickers present in our ATS map
    const techTickers = Object.keys(TECH_ATS_MAP).filter(t => universe.has(t));

    for (const ticker of techTickers) {
      const { ats, slug } = TECH_ATS_MAP[ticker];
      tickerCount++;
      try {
        const jobs = await client.getJobs(slug, ats);
        upsertHiringSnapshot({
          ticker,
          ts: started,
          ats,
          open_jobs: jobs.length,
        });
        storedCount++;
      } catch (e) {
        console.warn(`[refresh-hiring] failed for ${ticker} (${ats}/${slug}):`, (e as Error).message);
      }
    }
  } catch (e) {
    error = (e as Error).message;
    console.error('[refresh-hiring] fatal error:', error);
  }

  db.prepare(`UPDATE job_runs SET finished_at=?, status=?, detail=? WHERE id=?`)
    .run(
      Math.floor(Date.now() / 1000),
      error ? 'error' : 'ok',
      error ?? `tickers=${tickerCount} stored=${storedCount}`,
      job.lastInsertRowid,
    );

  return { tickers: tickerCount, stored: storedCount };
}
