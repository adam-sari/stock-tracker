import { getDb } from '../connection';

export type WikiPageviewRow = {
  ticker: string;
  date: string;   // YYYY-MM-DD
  views: number;
};

export function upsertWikiPageviews(rows: WikiPageviewRow[]) {
  if (rows.length === 0) return;
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO wiki_pageviews (ticker, date, views)
    VALUES (@ticker, @date, @views)
    ON CONFLICT (ticker, date) DO UPDATE SET views = excluded.views
  `);
  const tx = db.transaction((items: WikiPageviewRow[]) => {
    for (const r of items) stmt.run({ ticker: r.ticker.toUpperCase(), date: r.date, views: r.views });
  });
  tx(rows);
}

export function listWikiPageviews(ticker: string, limit = 30): WikiPageviewRow[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM wiki_pageviews WHERE ticker = ? ORDER BY date DESC LIMIT ?
  `).all(ticker.toUpperCase(), limit) as WikiPageviewRow[];
}

export function latestWikiPageviews(ticker: string): WikiPageviewRow | null {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM wiki_pageviews WHERE ticker = ? ORDER BY date DESC LIMIT 1`).get(ticker.toUpperCase());
  return (row as WikiPageviewRow | undefined) ?? null;
}
