import { getDb } from '../connection';
import { listTransactions, type Transaction } from './transactions';

export type Holding = {
  ticker: string;
  qty: number;
  avg_cost: number;
  total_cost: number;
};

/**
 * FIFO lot accounting: open lots are buys; sells consume from the oldest lots first.
 * Remaining lots form the current position; avg_cost is value-weighted across remaining lots.
 */
export function listHoldings(): Holding[] {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM transactions ORDER BY ticker, executed_at, id`).all() as Transaction[];

  const byTicker = new Map<string, Transaction[]>();
  for (const r of rows) {
    if (!byTicker.has(r.ticker)) byTicker.set(r.ticker, []);
    byTicker.get(r.ticker)!.push(r);
  }

  const result: Holding[] = [];
  for (const [ticker, txns] of byTicker) {
    type Lot = { qty: number; price: number };
    const lots: Lot[] = [];
    for (const t of txns) {
      if (t.kind === 'buy') {
        lots.push({ qty: t.qty, price: t.price });
      } else {
        let remaining = t.qty;
        while (remaining > 0 && lots.length > 0) {
          const head = lots[0];
          if (head.qty <= remaining) {
            remaining -= head.qty;
            lots.shift();
          } else {
            head.qty -= remaining;
            remaining = 0;
          }
        }
      }
    }
    const qty = lots.reduce((s, l) => s + l.qty, 0);
    if (qty <= 0) continue;
    const total_cost = lots.reduce((s, l) => s + l.qty * l.price, 0);
    const avg_cost = total_cost / qty;
    result.push({ ticker, qty, avg_cost, total_cost });
  }

  return result.sort((a, b) => a.ticker.localeCompare(b.ticker));
}
