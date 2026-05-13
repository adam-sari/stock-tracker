import { getDb } from '../connection';

export type InsiderTxnRow = {
  id: string;
  ticker: string;
  insider_name: string;
  insider_role?: string;
  code: string;
  is_derivative: number;
  shares: number;
  price?: number;
  value?: number;
  txn_date: string;
  filed_at: number;
  filing_url?: string;
  source: string;
};

export function upsertInsiderTxns(rows: InsiderTxnRow[]) {
  if (rows.length === 0) return;
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO insider_txns (id, ticker, insider_name, insider_role, code, is_derivative, shares, price, value, txn_date, filed_at, filing_url, source)
    VALUES (@id, @ticker, @insider_name, @insider_role, @code, @is_derivative, @shares, @price, @value, @txn_date, @filed_at, @filing_url, @source)
    ON CONFLICT (id) DO UPDATE SET shares = excluded.shares, price = excluded.price
  `);
  const tx = db.transaction((items: InsiderTxnRow[]) => {
    for (const r of items) stmt.run({
      ...r,
      ticker: r.ticker.toUpperCase(),
      insider_role: r.insider_role ?? null,
      price: r.price ?? null,
      value: r.value ?? null,
      filing_url: r.filing_url ?? null,
    });
  });
  tx(rows);
}

export type InsiderSentimentMonthRow = {
  ticker: string;
  year: number;
  month: number;
  net_change: number;
  mspr: number;
};

export function upsertInsiderSentiment(rows: InsiderSentimentMonthRow[]) {
  if (rows.length === 0) return;
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO insider_sentiment_monthly (ticker, year, month, net_change, mspr)
    VALUES (@ticker, @year, @month, @net_change, @mspr)
    ON CONFLICT (ticker, year, month) DO UPDATE SET net_change = excluded.net_change, mspr = excluded.mspr
  `);
  const tx = db.transaction((items: InsiderSentimentMonthRow[]) => {
    for (const r of items) stmt.run({ ...r, ticker: r.ticker.toUpperCase() });
  });
  tx(rows);
}
