import type { Holding } from '../db/queries/holdings';

export type PortfolioRow = {
  ticker: string;
  qty: number;
  avg_cost: number;
  total_cost: number;
  current_price: number;
  market_value: number;
  pnl: number;
  pnl_pct: number;
  stale: boolean;
};

export type PortfolioValue = {
  total_value: number;
  total_cost: number;
  total_pnl: number;
  total_pnl_pct: number;
  rows: PortfolioRow[];
};

export function computePortfolioValue(holdings: Holding[], quotes: Map<string, number>): PortfolioValue {
  const rows: PortfolioRow[] = holdings.map(h => {
    const price = quotes.get(h.ticker);
    const current_price = price ?? 0;
    const market_value = current_price * h.qty;
    const pnl = market_value - h.total_cost;
    const pnl_pct = h.total_cost === 0 ? 0 : pnl / h.total_cost;
    return {
      ticker: h.ticker,
      qty: h.qty,
      avg_cost: h.avg_cost,
      total_cost: h.total_cost,
      current_price,
      market_value,
      pnl,
      pnl_pct,
      stale: price === undefined,
    };
  });

  const total_value = rows.reduce((s, r) => s + r.market_value, 0);
  const total_cost = rows.reduce((s, r) => s + r.total_cost, 0);
  const total_pnl = total_value - total_cost;
  const total_pnl_pct = total_cost === 0 ? 0 : total_pnl / total_cost;

  return { total_value, total_cost, total_pnl, total_pnl_pct, rows };
}
