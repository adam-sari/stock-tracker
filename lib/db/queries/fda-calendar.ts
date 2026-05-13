import { getDb } from '../connection';

export type FdaCalendarRow = {
  id: number;
  ticker: string;
  company_name: string;
  committee: string;
  description: string;
  event_date: string;
  fetched_at: number;
};

/**
 * Upsert an FDA calendar row. Deduplication key: (ticker, event_date, committee).
 */
export function upsertFdaEvent(row: Omit<FdaCalendarRow, 'id'>) {
  const db = getDb();
  db.prepare(`
    INSERT INTO fda_calendar (ticker, company_name, committee, description, event_date, fetched_at)
    VALUES (@ticker, @company_name, @committee, @description, @event_date, @fetched_at)
    ON CONFLICT (ticker, event_date, committee) DO UPDATE SET
      company_name = excluded.company_name,
      description = excluded.description,
      fetched_at = excluded.fetched_at
  `).run({ ...row, ticker: row.ticker.toUpperCase() });
}

/** List upcoming FDA events, optionally filtered by ticker. */
export function listFdaEvents(opts: { ticker?: string; limit?: number } = {}): FdaCalendarRow[] {
  const db = getDb();
  const limit = opts.limit ?? 50;
  if (opts.ticker) {
    return db.prepare(`
      SELECT * FROM fda_calendar WHERE ticker = ? ORDER BY event_date ASC LIMIT ?
    `).all(opts.ticker.toUpperCase(), limit) as FdaCalendarRow[];
  }
  return db.prepare(`
    SELECT * FROM fda_calendar ORDER BY event_date ASC LIMIT ?
  `).all(limit) as FdaCalendarRow[];
}
