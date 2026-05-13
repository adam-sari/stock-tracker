import { getDb } from '../db/connection';
import { upsertHalts, hashHalt } from '../db/queries/halts';
import type { NasdaqHaltsClient } from '../providers/nasdaq-halts';

export async function refreshHaltsOnce(client: NasdaqHaltsClient): Promise<{ inserted: number }> {
  const db = getDb();
  const started = Math.floor(Date.now() / 1000);
  const job = db.prepare(`INSERT INTO job_runs (job, started_at, status) VALUES ('refresh_halts', ?, 'running')`).run(started);

  let inserted = 0;
  let error: string | null = null;
  try {
    const halts = await client.getCurrentHalts();
    const now = Math.floor(Date.now() / 1000);
    const rows = halts.map(h => ({
      id: hashHalt(h.ticker, h.haltDate, h.haltTime),
      ticker: h.ticker,
      halt_date: h.haltDate,
      halt_time: h.haltTime,
      reason_code: h.reasonCode,
      market: h.market,
      fetched_at: now,
    }));
    upsertHalts(rows);
    inserted = rows.length;
  } catch (e) { error = (e as Error).message; }

  db.prepare(`UPDATE job_runs SET finished_at=?, status=?, detail=? WHERE id=?`)
    .run(Math.floor(Date.now() / 1000), error ? 'error' : 'ok', error ?? `inserted=${inserted}`, job.lastInsertRowid);
  return { inserted };
}
