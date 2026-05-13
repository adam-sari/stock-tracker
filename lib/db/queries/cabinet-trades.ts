import { getDb } from '../connection';
import { createHash } from 'node:crypto';

export type CabinetTradeRow = {
  id: string;
  ticker: string;
  official_name: string;
  role: string;
  transaction_date: string;
  amount_low: number | null;
  amount_high: number | null;
  kind: string;
  ptr_url: string;
  source: string;
  fetched_at: number;
};

export function hashCabinetTrade(
  officialName: string,
  ticker: string,
  transactionDate: string,
  kind: string,
): string {
  return createHash('sha256')
    .update(`${officialName}|${ticker}|${transactionDate}|${kind}`)
    .digest('hex');
}

/** Upsert multiple cabinet trade rows in a single transaction. */
export function upsertCabinetTrades(rows: CabinetTradeRow[]) {
  if (rows.length === 0) return;
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO cabinet_trades
      (id, ticker, official_name, role, transaction_date, amount_low, amount_high, kind, ptr_url, source, fetched_at)
    VALUES
      (@id, @ticker, @official_name, @role, @transaction_date, @amount_low, @amount_high, @kind, @ptr_url, @source, @fetched_at)
    ON CONFLICT (id) DO UPDATE SET
      amount_low = excluded.amount_low,
      amount_high = excluded.amount_high,
      fetched_at = excluded.fetched_at
  `);
  const tx = db.transaction((items: CabinetTradeRow[]) => {
    for (const r of items) {
      stmt.run({ ...r, ticker: r.ticker.toUpperCase() });
    }
  });
  tx(rows);
}

/** List cabinet trades for a given ticker, newest first. */
export function listCabinetTradesForTicker(ticker: string, limit = 100): CabinetTradeRow[] {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM cabinet_trades WHERE ticker = ? ORDER BY transaction_date DESC LIMIT ?`)
    .all(ticker.toUpperCase(), limit) as CabinetTradeRow[];
}

/** List all cabinet trades, newest first. */
export function listCabinetTrades(opts: { limit?: number } = {}): CabinetTradeRow[] {
  const db = getDb();
  const limit = opts.limit ?? 200;
  return db
    .prepare(`SELECT * FROM cabinet_trades ORDER BY transaction_date DESC LIMIT ?`)
    .all(limit) as CabinetTradeRow[];
}
