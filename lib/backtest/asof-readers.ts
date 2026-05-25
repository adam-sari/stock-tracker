import type Database from 'better-sqlite3';

/** Convert YYYY-MM-DD as-of date into the epoch second at 23:59:59 UTC of that day. */
export function asOfEpoch(date: string): number {
  return Math.floor(new Date(`${date}T23:59:59Z`).getTime() / 1000);
}

/** Convert YYYY-MM-DD to the epoch second at 00:00:00 UTC of (date - lookbackDays). */
export function lookbackEpoch(date: string, lookbackDays: number): number {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - lookbackDays);
  return Math.floor(d.getTime() / 1000);
}

export type CandleRow = { ticker: string; date: string; volume: number };

/** Read all daily candles for tickers, up to and including asOfDate, going back lookbackDays+1 days. */
export function readCandlesAsOf(
  db: Database.Database,
  asOfDate: string,
  lookbackDays: number,
  tickers?: string[],
): CandleRow[] {
  const fromDate = (() => {
    const d = new Date(`${asOfDate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - lookbackDays - 1);
    return d.toISOString().slice(0, 10);
  })();
  if (tickers && tickers.length > 0) {
    const placeholders = tickers.map(() => '?').join(',');
    return db.prepare(
      `SELECT ticker, date, volume FROM candles_daily
       WHERE date >= ? AND date <= ? AND ticker IN (${placeholders})`
    ).all(fromDate, asOfDate, ...tickers) as CandleRow[];
  }
  return db.prepare(
    `SELECT ticker, date, volume FROM candles_daily
     WHERE date >= ? AND date <= ?`
  ).all(fromDate, asOfDate) as CandleRow[];
}
