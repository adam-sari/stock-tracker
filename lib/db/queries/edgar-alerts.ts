import { getDb } from '../connection';

export type EdgarAlert = {
  id: number;
  ticker: string;
  phrase: string;
  filing_url: string;
  filing_date: string;
  snippet: string;
  fetched_at: number;
};

/**
 * Upsert an edgar_alerts row. Deduplication key: (ticker, phrase, filing_url).
 */
export function upsertEdgarAlert(row: Omit<EdgarAlert, 'id'>) {
  const db = getDb();
  db.prepare(`
    INSERT INTO edgar_alerts (ticker, phrase, filing_url, filing_date, snippet, fetched_at)
    VALUES (@ticker, @phrase, @filing_url, @filing_date, @snippet, @fetched_at)
    ON CONFLICT (ticker, phrase, filing_url) DO UPDATE SET
      filing_date = excluded.filing_date,
      snippet = excluded.snippet,
      fetched_at = excluded.fetched_at
  `).run(row);
}

/** List recent edgar_alerts, optionally filtered by ticker. */
export function listEdgarAlerts(opts: { ticker?: string; limit?: number } = {}): EdgarAlert[] {
  const db = getDb();
  const limit = opts.limit ?? 50;
  if (opts.ticker) {
    return db.prepare(`
      SELECT * FROM edgar_alerts WHERE ticker = ? ORDER BY filing_date DESC LIMIT ?
    `).all(opts.ticker.toUpperCase(), limit) as EdgarAlert[];
  }
  return db.prepare(`
    SELECT * FROM edgar_alerts ORDER BY filing_date DESC LIMIT ?
  `).all(limit) as EdgarAlert[];
}
