import { getDb } from '../connection';

export type TransactionInput = {
  ticker: string;
  kind: 'buy' | 'sell';
  qty: number;
  price: number;
  fees?: number;
  executed_at: string;
  note?: string;
};

export type Transaction = TransactionInput & {
  id: number;
  fees: number;
  created_at: string;
};

export function createTransaction(input: TransactionInput): Transaction {
  const db = getDb();
  const ticker = input.ticker.toUpperCase();
  const fees = input.fees ?? 0;
  const stmt = db.prepare(`
    INSERT INTO transactions (ticker, kind, qty, price, fees, executed_at, note)
    VALUES (@ticker, @kind, @qty, @price, @fees, @executed_at, @note)
    RETURNING *
  `);
  return stmt.get({ ...input, ticker, fees, note: input.note ?? null }) as Transaction;
}

export function listTransactions(opts: { ticker?: string } = {}): Transaction[] {
  const db = getDb();
  if (opts.ticker) {
    return db.prepare(`SELECT * FROM transactions WHERE ticker = ? ORDER BY executed_at DESC, id DESC`)
      .all(opts.ticker.toUpperCase()) as Transaction[];
  }
  return db.prepare(`SELECT * FROM transactions ORDER BY executed_at DESC, id DESC`).all() as Transaction[];
}

export function deleteTransaction(id: number): boolean {
  const db = getDb();
  const info = db.prepare(`DELETE FROM transactions WHERE id = ?`).run(id);
  return info.changes > 0;
}

export function getTransaction(id: number): Transaction | null {
  const db = getDb();
  return (db.prepare(`SELECT * FROM transactions WHERE id = ?`).get(id) as Transaction | undefined) ?? null;
}
