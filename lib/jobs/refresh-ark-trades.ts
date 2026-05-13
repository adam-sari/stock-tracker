import { getDb } from '../db/connection';
import { upsertArkTrades } from '../db/queries/ark-trades';
import { ArkClient, ARK_FUNDS } from '../providers/ark';

export async function refreshArkTradesOnce(
  client: ArkClient = new ArkClient(),
): Promise<{ funds: number; stored: number }> {
  const db = getDb();
  const started = Math.floor(Date.now() / 1000);
  const job = db
    .prepare(`INSERT INTO job_runs (job, started_at, status) VALUES ('refresh_ark_trades', ?, 'running')`)
    .run(started);

  let storedCount = 0;
  let fundsProcessed = 0;
  let error: string | null = null;

  try {
    for (const fund of ARK_FUNDS) {
      try {
        const trades = await client.fetchFundTrades(fund);
        const rows = trades.map(t => ({
          fund: t.fund,
          ticker: t.ticker,
          direction: t.direction,
          shares: t.shares,
          ts: t.ts,
          fetched_at: started,
        }));
        upsertArkTrades(rows);
        storedCount += rows.length;
        fundsProcessed++;
      } catch (e) {
        console.warn(`[refresh-ark-trades] failed for ${fund}:`, (e as Error).message);
      }
    }
  } catch (e) {
    error = (e as Error).message;
    console.error('[refresh-ark-trades] fatal error:', error);
  }

  db.prepare(`UPDATE job_runs SET finished_at=?, status=?, detail=? WHERE id=?`)
    .run(
      Math.floor(Date.now() / 1000),
      error ? 'error' : 'ok',
      error ?? `funds=${fundsProcessed} stored=${storedCount}`,
      job.lastInsertRowid,
    );

  return { funds: fundsProcessed, stored: storedCount };
}
