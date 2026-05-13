import { getDb } from '../db/connection';
import { listHoldings } from '../db/queries/holdings';
import { upsertFdaEvent } from '../db/queries/fda-calendar';
import { FinnhubClient } from '../providers/finnhub';

export async function refreshFdaCalendarOnce(
  client: FinnhubClient,
): Promise<{ stored: number; skipped: boolean }> {
  const db = getDb();
  const started = Math.floor(Date.now() / 1000);
  const job = db
    .prepare(`INSERT INTO job_runs (job, started_at, status) VALUES ('refresh_fda_calendar', ?, 'running')`)
    .run(started);

  let storedCount = 0;
  let skipped = false;
  let error: string | null = null;

  try {
    // Build universe: held + watched tickers
    const holdings = listHoldings();
    const watchRows = db.prepare(`SELECT ticker FROM watchlist`).all() as Array<{ ticker: string }>;
    const universe = new Set<string>([
      ...holdings.map(h => h.ticker.toUpperCase()),
      ...watchRows.map(w => w.ticker.toUpperCase()),
    ]);

    const events = await client.getFdaCalendar();

    if (events === null) {
      // 403 — endpoint is behind a paid tier gate; skip silently
      skipped = true;
      console.info('[refresh-fda-calendar] FDA calendar endpoint returned 403 (paid tier). Skipping.');
    } else {
      // Filter to held + watched universe
      for (const event of events) {
        const ticker = (event.ticker ?? '').toUpperCase();
        if (!ticker || !universe.has(ticker)) continue;
        upsertFdaEvent({
          ticker,
          company_name: event.companyName,
          committee: event.fdaCommittee,
          description: event.eventDescription,
          event_date: event.eventDate,
          fetched_at: started,
        });
        storedCount++;
      }
    }
  } catch (e) {
    error = (e as Error).message;
    console.error('[refresh-fda-calendar] fatal error:', error);
  }

  db.prepare(`UPDATE job_runs SET finished_at=?, status=?, detail=? WHERE id=?`)
    .run(
      Math.floor(Date.now() / 1000),
      error ? 'error' : 'ok',
      error ?? (skipped ? 'skipped=403' : `stored=${storedCount}`),
      job.lastInsertRowid,
    );

  return { stored: storedCount, skipped };
}
