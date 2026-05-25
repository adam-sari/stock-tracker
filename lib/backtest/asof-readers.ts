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

export type InsiderRow = {
  ticker: string;
  insider_name: string;
  code: string;
  is_derivative: number;
  filed_at: number;
};

export function readInsiderAsOf(
  db: Database.Database,
  asOfDate: string,
  lookbackDays: number,
  tickers?: string[],
): InsiderRow[] {
  const upper = asOfEpoch(asOfDate);
  const lower = lookbackEpoch(asOfDate, lookbackDays);
  if (tickers && tickers.length > 0) {
    const placeholders = tickers.map(() => '?').join(',');
    return db.prepare(
      `SELECT ticker, insider_name, code, is_derivative, filed_at
       FROM insider_txns WHERE filed_at >= ? AND filed_at <= ? AND ticker IN (${placeholders})`
    ).all(lower, upper, ...tickers) as InsiderRow[];
  }
  return db.prepare(
    `SELECT ticker, insider_name, code, is_derivative, filed_at
     FROM insider_txns WHERE filed_at >= ? AND filed_at <= ?`
  ).all(lower, upper) as InsiderRow[];
}

export type CongressAsOfRow = { ticker: string; member: string; kind: string; disclosed_at: number };

export function readCongressAsOf(
  db: Database.Database,
  asOfDate: string,
  lookbackDays: number,
  tickers?: string[],
): CongressAsOfRow[] {
  const upper = asOfEpoch(asOfDate);
  const lower = lookbackEpoch(asOfDate, lookbackDays);
  if (tickers && tickers.length > 0) {
    const placeholders = tickers.map(() => '?').join(',');
    return db.prepare(
      `SELECT ticker, member, kind, disclosed_at FROM congress_trades
       WHERE disclosed_at >= ? AND disclosed_at <= ? AND ticker IN (${placeholders})`
    ).all(lower, upper, ...tickers) as CongressAsOfRow[];
  }
  return db.prepare(
    `SELECT ticker, member, kind, disclosed_at FROM congress_trades
     WHERE disclosed_at >= ? AND disclosed_at <= ?`
  ).all(lower, upper) as CongressAsOfRow[];
}
