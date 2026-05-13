import { getDb } from '../connection';
import { createHash } from 'node:crypto';

export type TradingHaltRow = {
  id: string;
  ticker: string;
  halt_date: string;
  halt_time: string;
  reason_code: string;
  market: string;
  resumed_at?: number;
  fetched_at: number;
};

export function hashHalt(ticker: string, haltDate: string, haltTime: string): string {
  return createHash('sha256').update(`${ticker}|${haltDate}|${haltTime}`).digest('hex');
}

export function upsertHalts(rows: TradingHaltRow[]) {
  if (rows.length === 0) return;
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO trading_halts (id, ticker, halt_date, halt_time, reason_code, market, resumed_at, fetched_at)
    VALUES (@id, @ticker, @halt_date, @halt_time, @reason_code, @market, @resumed_at, @fetched_at)
    ON CONFLICT (id) DO UPDATE SET fetched_at = excluded.fetched_at
  `);
  const tx = db.transaction((items: TradingHaltRow[]) => {
    for (const r of items) stmt.run({ ...r, ticker: r.ticker.toUpperCase(), resumed_at: r.resumed_at ?? null });
  });
  tx(rows);
}

export function listRecentHalts(sinceTs: number): TradingHaltRow[] {
  const db = getDb();
  return db.prepare(`SELECT * FROM trading_halts WHERE fetched_at >= ? ORDER BY halt_date DESC, halt_time DESC`)
    .all(sinceTs) as TradingHaltRow[];
}
