import { getDb } from '../connection';

export type EarningsRow = {
  ticker: string;
  earnings_date: string;
  hour?: string;
  eps_estimate?: number;
  eps_actual?: number;
  revenue_estimate?: number;
  revenue_actual?: number;
  quarter?: number;
  fiscal_year?: number;
  num_estimates?: number;
  source: string;
};

export function upsertEarnings(rows: EarningsRow[]) {
  if (rows.length === 0) return;
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO earnings_calendar (ticker, earnings_date, hour, eps_estimate, eps_actual, revenue_estimate, revenue_actual, quarter, fiscal_year, num_estimates, source)
    VALUES (@ticker, @earnings_date, @hour, @eps_estimate, @eps_actual, @revenue_estimate, @revenue_actual, @quarter, @fiscal_year, @num_estimates, @source)
    ON CONFLICT (ticker, earnings_date) DO UPDATE SET
      hour = COALESCE(excluded.hour, earnings_calendar.hour),
      eps_estimate = COALESCE(excluded.eps_estimate, earnings_calendar.eps_estimate),
      eps_actual = COALESCE(excluded.eps_actual, earnings_calendar.eps_actual),
      revenue_estimate = COALESCE(excluded.revenue_estimate, earnings_calendar.revenue_estimate),
      revenue_actual = COALESCE(excluded.revenue_actual, earnings_calendar.revenue_actual),
      num_estimates = COALESCE(excluded.num_estimates, earnings_calendar.num_estimates)
  `);
  const tx = db.transaction((items: EarningsRow[]) => {
    for (const r of items) stmt.run({
      ticker: r.ticker.toUpperCase(),
      earnings_date: r.earnings_date,
      hour: r.hour ?? null,
      eps_estimate: r.eps_estimate ?? null,
      eps_actual: r.eps_actual ?? null,
      revenue_estimate: r.revenue_estimate ?? null,
      revenue_actual: r.revenue_actual ?? null,
      quarter: r.quarter ?? null,
      fiscal_year: r.fiscal_year ?? null,
      num_estimates: r.num_estimates ?? null,
      source: r.source,
    });
  });
  tx(rows);
}
