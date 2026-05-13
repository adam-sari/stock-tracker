import { getDb } from '../connection';
import { createHash } from 'node:crypto';

export type NewsRow = {
  id: string;
  ticker: string;
  headline: string;
  url: string;
  source: string;
  published_at: number;
  fetched_at: number;
};

export function hashUrl(url: string): string {
  return createHash('sha256').update(url).digest('hex');
}

export function upsertNews(rows: NewsRow[]) {
  if (rows.length === 0) return;
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO news (id, ticker, headline, url, source, published_at, fetched_at)
    VALUES (@id, @ticker, @headline, @url, @source, @published_at, @fetched_at)
    ON CONFLICT (id) DO UPDATE SET
      headline = excluded.headline,
      fetched_at = excluded.fetched_at
  `);
  const tx = db.transaction((items: NewsRow[]) => {
    for (const r of items) stmt.run({ ...r, ticker: r.ticker.toUpperCase() });
  });
  tx(rows);
}

export function listNewsForTicker(ticker: string, limit = 50): NewsRow[] {
  const db = getDb();
  return db.prepare(`SELECT * FROM news WHERE ticker = ? ORDER BY published_at DESC LIMIT ?`)
    .all(ticker.toUpperCase(), limit) as NewsRow[];
}
