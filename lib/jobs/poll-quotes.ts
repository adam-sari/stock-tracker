import { getDb } from '../db/connection';
import { listHoldings } from '../db/queries/holdings';
import { upsertQuoteLatest } from '../db/queries/candles';
import type { ProviderChain } from '../providers/chain';

export async function pollQuotesOnce(chain: ProviderChain): Promise<{ updated: number }> {
  const db = getDb();
  const started = Math.floor(Date.now() / 1000);
  const jobRun = db.prepare(`INSERT INTO job_runs (job, started_at, status) VALUES (?, ?, 'running')`).run('poll_quotes', started);

  let updated = 0;
  let error: string | null = null;
  try {
    const holdings = listHoldings();
    for (const h of holdings) {
      const q = await chain.getLatestQuote(h.ticker);
      if (q) {
        upsertQuoteLatest({ ...q, source: 'chain' });
        updated++;
      }
    }
  } catch (e) {
    error = (e as Error).message;
  }

  const finished = Math.floor(Date.now() / 1000);
  db.prepare(`UPDATE job_runs SET finished_at = ?, status = ?, detail = ? WHERE id = ?`)
    .run(finished, error ? 'error' : 'ok', error ?? `updated=${updated}`, jobRun.lastInsertRowid);

  return { updated };
}
