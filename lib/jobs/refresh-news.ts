import { getDb } from '../db/connection';
import { listHoldings } from '../db/queries/holdings';
import { hashUrl, upsertNews, type NewsRow } from '../db/queries/news';
import type { FinnhubClient } from '../providers/finnhub';

export async function refreshNewsOnce(finnhub: FinnhubClient): Promise<{ inserted: number }> {
  const db = getDb();
  const started = Math.floor(Date.now() / 1000);
  const job = db.prepare(`INSERT INTO job_runs (job, started_at, status) VALUES ('refresh_news', ?, 'running')`).run(started);

  let inserted = 0;
  let error: string | null = null;
  const now = Math.floor(Date.now() / 1000);
  const sevenDaysAgo = new Date((now - 7 * 86400) * 1000);
  const today = new Date(now * 1000);

  try {
    const holdings = listHoldings();
    const rows: NewsRow[] = [];
    for (const h of holdings) {
      const items = await finnhub.getCompanyNews(h.ticker, sevenDaysAgo, today);
      for (const it of items) {
        rows.push({
          id: hashUrl(it.url),
          ticker: h.ticker,
          headline: it.headline,
          url: it.url,
          source: 'finnhub',
          published_at: it.publishedAt,
          fetched_at: now,
        });
      }
    }
    upsertNews(rows);
    inserted = rows.length;
  } catch (e) {
    error = (e as Error).message;
  }

  db.prepare(`UPDATE job_runs SET finished_at=?, status=?, detail=? WHERE id=?`)
    .run(Math.floor(Date.now() / 1000), error ? 'error' : 'ok', error ?? `inserted=${inserted}`, job.lastInsertRowid);
  return { inserted };
}
