import { getDb } from '../connection';

export type ArkTradeRow = {
  id: number;
  fund: string;
  ticker: string;
  direction: string;
  shares: number;
  ts: string;
  fetched_at: number;
};

/**
 * Upsert an ARK trade row. Deduplication key: (fund, ticker, direction, ts).
 */
export function upsertArkTrade(row: Omit<ArkTradeRow, 'id'>) {
  const db = getDb();
  db.prepare(`
    INSERT INTO ark_trades (fund, ticker, direction, shares, ts, fetched_at)
    VALUES (@fund, @ticker, @direction, @shares, @ts, @fetched_at)
    ON CONFLICT (fund, ticker, direction, ts) DO UPDATE SET
      shares = excluded.shares,
      fetched_at = excluded.fetched_at
  `).run({ ...row, ticker: row.ticker.toUpperCase(), fund: row.fund.toUpperCase() });
}

/** Upsert multiple ARK trades in a single transaction. */
export function upsertArkTrades(rows: Omit<ArkTradeRow, 'id'>[]) {
  if (rows.length === 0) return;
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO ark_trades (fund, ticker, direction, shares, ts, fetched_at)
    VALUES (@fund, @ticker, @direction, @shares, @ts, @fetched_at)
    ON CONFLICT (fund, ticker, direction, ts) DO UPDATE SET
      shares = excluded.shares,
      fetched_at = excluded.fetched_at
  `);
  const tx = db.transaction((items: Omit<ArkTradeRow, 'id'>[]) => {
    for (const r of items) {
      stmt.run({ ...r, ticker: r.ticker.toUpperCase(), fund: r.fund.toUpperCase() });
    }
  });
  tx(rows);
}

/** List recent ARK trades, optionally filtered by ticker or fund. */
export function listArkTrades(opts: { ticker?: string; fund?: string; limit?: number } = {}): ArkTradeRow[] {
  const db = getDb();
  const limit = opts.limit ?? 100;
  if (opts.ticker && opts.fund) {
    return db.prepare(`
      SELECT * FROM ark_trades WHERE ticker = ? AND fund = ? ORDER BY ts DESC LIMIT ?
    `).all(opts.ticker.toUpperCase(), opts.fund.toUpperCase(), limit) as ArkTradeRow[];
  }
  if (opts.ticker) {
    return db.prepare(`
      SELECT * FROM ark_trades WHERE ticker = ? ORDER BY ts DESC LIMIT ?
    `).all(opts.ticker.toUpperCase(), limit) as ArkTradeRow[];
  }
  if (opts.fund) {
    return db.prepare(`
      SELECT * FROM ark_trades WHERE fund = ? ORDER BY ts DESC LIMIT ?
    `).all(opts.fund.toUpperCase(), limit) as ArkTradeRow[];
  }
  return db.prepare(`
    SELECT * FROM ark_trades ORDER BY ts DESC LIMIT ?
  `).all(limit) as ArkTradeRow[];
}
