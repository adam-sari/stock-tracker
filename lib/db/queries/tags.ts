import { getDb } from '../connection';

export type Tag = { ticker: string; tag: string; added_at: number };

export function listTagsForTicker(ticker: string): string[] {
  const rows = getDb().prepare(`SELECT tag FROM tags WHERE ticker = ? ORDER BY tag`).all(ticker.toUpperCase()) as Array<{ tag: string }>;
  return rows.map(r => r.tag);
}

export function listAllTags(): string[] {
  const rows = getDb().prepare(`SELECT DISTINCT tag FROM tags ORDER BY tag`).all() as Array<{ tag: string }>;
  return rows.map(r => r.tag);
}

export function listTagsByTickerMap(): Map<string, string[]> {
  const rows = getDb().prepare(`SELECT ticker, tag FROM tags ORDER BY ticker, tag`).all() as Array<{ ticker: string; tag: string }>;
  const out = new Map<string, string[]>();
  for (const r of rows) {
    if (!out.has(r.ticker)) out.set(r.ticker, []);
    out.get(r.ticker)!.push(r.tag);
  }
  return out;
}

export function addTag(ticker: string, tag: string) {
  const cleaned = tag.toLowerCase().trim();
  if (!cleaned) return;
  getDb().prepare(`INSERT OR REPLACE INTO tags (ticker, tag, added_at) VALUES (?, ?, ?)`)
    .run(ticker.toUpperCase(), cleaned, Math.floor(Date.now() / 1000));
}

export function removeTag(ticker: string, tag: string) {
  getDb().prepare(`DELETE FROM tags WHERE ticker = ? AND tag = ?`).run(ticker.toUpperCase(), tag.toLowerCase().trim());
}
