import { getDb } from '../connection';

export type RecommendationRow = {
  ticker: string;
  period: string;
  strong_buy: number;
  buy: number;
  hold: number;
  sell: number;
  strong_sell: number;
};

export function upsertRecommendations(rows: RecommendationRow[]) {
  if (rows.length === 0) return;
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO analyst_recommendations (ticker, period, strong_buy, buy, hold, sell, strong_sell)
    VALUES (@ticker, @period, @strong_buy, @buy, @hold, @sell, @strong_sell)
    ON CONFLICT (ticker, period) DO UPDATE SET
      strong_buy = excluded.strong_buy, buy = excluded.buy, hold = excluded.hold, sell = excluded.sell, strong_sell = excluded.strong_sell
  `);
  const tx = db.transaction((items: RecommendationRow[]) => {
    for (const r of items) stmt.run({ ...r, ticker: r.ticker.toUpperCase() });
  });
  tx(rows);
}
