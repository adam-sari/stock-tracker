import { getDb } from '../db/connection';
import { listHoldings } from '../db/queries/holdings';
import { upsertSentimentSnapshots } from '../db/queries/sentiment';
import type { ApewisdomClient } from '../providers/apewisdom';

export async function refreshSentimentOnce(ape: ApewisdomClient): Promise<{ snapshots: number }> {
  const db = getDb();
  const started = Math.floor(Date.now() / 1000);
  const job = db.prepare(`INSERT INTO job_runs (job, started_at, status) VALUES ('refresh_sentiment', ?, 'running')`).run(started);

  let snapshots = 0;
  let error: string | null = null;
  try {
    const holdings = listHoldings();
    const watch = db.prepare(`SELECT ticker FROM watchlist`).all() as Array<{ ticker: string }>;
    const universe = new Set([...holdings.map(h => h.ticker), ...watch.map(w => w.ticker)].map(t => t.toUpperCase()));

    const top = await ape.getTopStocks(1);
    const ts = Math.floor(Date.now() / 1000);
    const rows = top
      .filter(t => universe.has(t.ticker.toUpperCase()))
      .map(t => ({
        ticker: t.ticker,
        ts,
        source: 'apewisdom',
        rank: t.rank,
        mentions: t.mentions,
        upvotes: t.upvotes,
        mentions_24h_ago: t.mentions24hAgo,
      }));
    upsertSentimentSnapshots(rows);
    snapshots = rows.length;
  } catch (e) { error = (e as Error).message; }

  db.prepare(`UPDATE job_runs SET finished_at=?, status=?, detail=? WHERE id=?`)
    .run(Math.floor(Date.now() / 1000), error ? 'error' : 'ok', error ?? `snapshots=${snapshots}`, job.lastInsertRowid);
  return { snapshots };
}
