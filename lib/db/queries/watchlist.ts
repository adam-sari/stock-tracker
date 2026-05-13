import { getDb } from '../connection';

export type WatchlistRow = {
  ticker: string;
  added_at: number;
  source: 'manual' | 'discovery';
  note: string | null;
};

export function addToWatchlist(ticker: string, source: 'manual' | 'discovery' = 'manual', note?: string) {
  const db = getDb();
  db.prepare(`
    INSERT INTO watchlist (ticker, added_at, source, note)
    VALUES (?, ?, ?, ?)
    ON CONFLICT (ticker) DO UPDATE SET source = excluded.source, note = excluded.note
  `).run(ticker.toUpperCase(), Math.floor(Date.now() / 1000), source, note ?? null);
}

export function removeFromWatchlist(ticker: string) {
  getDb().prepare(`DELETE FROM watchlist WHERE ticker = ?`).run(ticker.toUpperCase());
}

export function listWatchlist(): WatchlistRow[] {
  return getDb().prepare(`SELECT * FROM watchlist ORDER BY added_at DESC`).all() as WatchlistRow[];
}

export function isOnWatchlist(ticker: string): boolean {
  const row = getDb().prepare(`SELECT 1 FROM watchlist WHERE ticker = ?`).get(ticker.toUpperCase());
  return !!row;
}
