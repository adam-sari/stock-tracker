import { getDb } from '../connection';
import { createHash } from 'node:crypto';

export type CorporateActionRow = {
  id: string;
  ticker: string;
  kind: 'split' | 'dividend' | 'spinoff' | 'rename';
  ex_date: string;
  payment_date?: string;
  amount?: number;
  details_json?: string;
  source: string;
};

export function hashAction(ticker: string, kind: string, exDate: string): string {
  return createHash('sha256').update(`${ticker}|${kind}|${exDate}`).digest('hex');
}

export function upsertCorporateActions(rows: CorporateActionRow[]) {
  if (rows.length === 0) return;
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO corporate_actions (id, ticker, kind, ex_date, payment_date, amount, details_json, source)
    VALUES (@id, @ticker, @kind, @ex_date, @payment_date, @amount, @details_json, @source)
    ON CONFLICT (id) DO UPDATE SET amount = excluded.amount, payment_date = excluded.payment_date
  `);
  const tx = db.transaction((items: CorporateActionRow[]) => {
    for (const r of items) stmt.run({
      ...r,
      ticker: r.ticker.toUpperCase(),
      payment_date: r.payment_date ?? null,
      amount: r.amount ?? null,
      details_json: r.details_json ?? null,
    });
  });
  tx(rows);
}

export function listCorporateActions(ticker: string): CorporateActionRow[] {
  const db = getDb();
  return db.prepare(`SELECT * FROM corporate_actions WHERE ticker = ? ORDER BY ex_date DESC`).all(ticker.toUpperCase()) as CorporateActionRow[];
}
