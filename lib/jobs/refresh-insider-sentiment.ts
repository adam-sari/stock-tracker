import { getDb } from '../db/connection';
import { listHoldings } from '../db/queries/holdings';
import { upsertInsiderSentiment, type InsiderSentimentMonthRow } from '../db/queries/insider';
import type { FinnhubClient } from '../providers/finnhub';

export async function refreshInsiderSentimentOnce(finnhub: FinnhubClient): Promise<{ months: number }> {
  const db = getDb();
  const started = Math.floor(Date.now() / 1000);
  const job = db.prepare(`INSERT INTO job_runs (job, started_at, status) VALUES ('refresh_insider_sentiment', ?, 'running')`).run(started);

  let months = 0;
  let error: string | null = null;
  try {
    const holdings = listHoldings();
    const from = new Date(); from.setUTCFullYear(from.getUTCFullYear() - 2);
    const to = new Date();
    for (const h of holdings) {
      const data = await finnhub.getInsiderSentiment(h.ticker, from, to);
      const rows: InsiderSentimentMonthRow[] = data.map(d => ({
        ticker: d.ticker, year: d.year, month: d.month, net_change: d.change, mspr: d.mspr,
      }));
      upsertInsiderSentiment(rows);
      months += rows.length;
    }
  } catch (e) { error = (e as Error).message; }

  db.prepare(`UPDATE job_runs SET finished_at=?, status=?, detail=? WHERE id=?`)
    .run(Math.floor(Date.now() / 1000), error ? 'error' : 'ok', error ?? `months=${months}`, job.lastInsertRowid);
  return { months };
}
