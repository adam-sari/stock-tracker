import type Database from 'better-sqlite3';

/**
 * Returns the multiplier to apply to a PRE-split close so it compares apples-to-apples
 * with a POST-split close. For a 2-for-1 split, the multiplier is 1/2 = 0.5.
 *
 * Window: includes splits with `ex_date > fromDate AND ex_date <= toDate`.
 */
export function priceAdjustmentFactor(
  db: Database.Database,
  ticker: string,
  fromDate: string,
  toDate: string,
): number {
  const rows = db.prepare(
    `SELECT amount FROM corporate_actions
     WHERE ticker = ? AND kind = 'split' AND ex_date > ? AND ex_date <= ?`
  ).all(ticker, fromDate, toDate) as Array<{ amount: number | null }>;
  let factor = 1.0;
  for (const r of rows) {
    if (r.amount && r.amount > 0) factor /= r.amount;
  }
  return factor;
}
