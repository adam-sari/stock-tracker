import { getDb } from '../connection';
import { createHash } from 'node:crypto';

export type CongressTradeRow = {
  id: string;
  ticker: string;
  chamber: 'house' | 'senate';
  member: string;
  district: string;
  party?: string;
  kind: string;
  amount_low: number;
  amount_high: number;
  txn_date: string;
  disclosed_at: number;
  ptr_url: string;
  source: string;
};

export function hashCongressTrade(ptrUrl: string, ticker: string, txnDate: string): string {
  return createHash('sha256').update(`${ptrUrl}|${ticker}|${txnDate}`).digest('hex');
}

export function upsertCongressTrades(rows: CongressTradeRow[]) {
  if (rows.length === 0) return;
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO congress_trades (id, ticker, chamber, member, district, party, kind, amount_low, amount_high, txn_date, disclosed_at, ptr_url, source)
    VALUES (@id, @ticker, @chamber, @member, @district, @party, @kind, @amount_low, @amount_high, @txn_date, @disclosed_at, @ptr_url, @source)
    ON CONFLICT (id) DO UPDATE SET
      member = excluded.member, district = excluded.district, kind = excluded.kind, amount_low = excluded.amount_low, amount_high = excluded.amount_high
  `);
  const tx = db.transaction((items: CongressTradeRow[]) => {
    for (const r of items) stmt.run({ ...r, ticker: r.ticker.toUpperCase(), party: r.party ?? null });
  });
  tx(rows);
}

export function listCongressForTicker(ticker: string, limit = 100): CongressTradeRow[] {
  const db = getDb();
  return db.prepare(`SELECT * FROM congress_trades WHERE ticker=? ORDER BY txn_date DESC LIMIT ?`)
    .all(ticker.toUpperCase(), limit) as CongressTradeRow[];
}
