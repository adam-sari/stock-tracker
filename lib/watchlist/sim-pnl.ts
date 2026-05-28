import type Database from 'better-sqlite3';
import { priceAdjustmentFactor } from './price-adjustment';

const ENTRY_WINDOW_CALENDAR_DAYS = 20;
const STALE_GAP_CALENDAR_DAYS = 14;

export type RowStatus = 'active' | 'stale' | 'delisted';

export type SimRow = {
  ticker: string;
  status: RowStatus;
  entryDate: string;
  entryClose: number;
  splitAdjFactor: number;
  exitDate: string;
  exitClose: number;
  returnPct: number;
  spyEntryClose: number;
  spyExitClose: number;
  spyReturnPct: number;
  spyExcessPct: number;
  daysHeld: number;
  delistDate: string | null;
};

export type SkipReason = 'no_data' | 'no_entry_candle_within_window' | 'no_spy_entry';

export type SkippedTicker = { ticker: string; reason: SkipReason };

export type SimAggregate = {
  n: number;
  perTickerMean: {
    returnPct: number;
    spyExcessPct: number;
    hitRate: number;
  };
  portfolio: {
    activeN: number;
    returnPct: number;
    spyExcessPct: number;
  };
};

export type SimResult = {
  rows: SimRow[];
  aggregate: SimAggregate;
  skipped: SkippedTicker[];
  asOfDate: string;
  spyMissing: boolean;
};

function firstCloseInWindow(
  db: Database.Database, ticker: string, isoDate: string, calendarDayLimit: number,
): { date: string; close: number } | null {
  return db.prepare(
    `SELECT date, close FROM candles_daily
     WHERE ticker = ? AND date >= ? AND date <= date(?, '+' || ? || ' day')
     ORDER BY date ASC LIMIT 1`
  ).get(ticker, isoDate, isoDate, calendarDayLimit) as { date: string; close: number } | undefined ?? null;
}

function lastCloseOnOrBefore(
  db: Database.Database, ticker: string, isoDate: string,
): { date: string; close: number } | null {
  return db.prepare(
    `SELECT date, close FROM candles_daily WHERE ticker = ? AND date <= ? ORDER BY date DESC LIMIT 1`
  ).get(ticker, isoDate) as { date: string; close: number } | undefined ?? null;
}

function tickerHasAnyCandle(db: Database.Database, ticker: string): boolean {
  const r = db.prepare(`SELECT 1 FROM candles_daily WHERE ticker = ? LIMIT 1`).get(ticker);
  return !!r;
}

function delistDateOf(db: Database.Database, ticker: string, asOf: string): string | null {
  const r = db.prepare(
    `SELECT to_date FROM sp500_membership WHERE ticker = ? AND to_date IS NOT NULL AND to_date <= ?
     ORDER BY to_date DESC LIMIT 1`
  ).get(ticker, asOf) as { to_date: string } | undefined;
  return r?.to_date ?? null;
}

function calendarDaysBetween(fromIso: string, toIso: string): number {
  return Math.floor((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 86_400_000);
}

function emptyAggregate(): SimAggregate {
  return {
    n: 0,
    perTickerMean: { returnPct: 0, spyExcessPct: 0, hitRate: 0 },
    portfolio:     { activeN: 0, returnPct: 0, spyExcessPct: 0 },
  };
}

function aggregateOf(rows: SimRow[]): SimAggregate {
  const n = rows.length;
  if (n === 0) return emptyAggregate();
  const perTickerMean = {
    returnPct:    rows.reduce((a, r) => a + r.returnPct,    0) / n,
    spyExcessPct: rows.reduce((a, r) => a + r.spyExcessPct, 0) / n,
    hitRate:      rows.filter(r => r.spyExcessPct > 0).length / n,
  };
  const active = rows.filter(r => r.status !== 'delisted');
  let portfolio: { activeN: number; returnPct: number; spyExcessPct: number };
  if (active.length === 0) {
    portfolio = { activeN: 0, returnPct: 0, spyExcessPct: 0 };
  } else {
    const meanR    = active.reduce((a, r) => a + r.returnPct,    0) / active.length;
    const meanSpyR = active.reduce((a, r) => a + r.spyReturnPct, 0) / active.length;
    portfolio = { activeN: active.length, returnPct: meanR, spyExcessPct: meanR - meanSpyR };
  }
  return { n, perTickerMean, portfolio };
}

export function simulateWatchlistPnL(db: Database.Database, asOfDate?: string): SimResult {
  const asOf = asOfDate ?? (db.prepare(`SELECT date('now') AS d`).get() as { d: string }).d;
  const watchlist = db.prepare(`SELECT ticker, added_at FROM watchlist ORDER BY ticker`)
    .all() as Array<{ ticker: string; added_at: number }>;

  const spyExit = lastCloseOnOrBefore(db, 'SPY', asOf);
  const spyMissing = !spyExit;
  if (spyMissing) {
    return {
      rows: [], aggregate: emptyAggregate(),
      skipped: [], asOfDate: asOf, spyMissing: true,
    };
  }

  const rows: SimRow[] = [];
  const skipped: SkippedTicker[] = [];

  for (const w of watchlist) {
    const addedIso = new Date((w.added_at - 86400) * 1000).toISOString().slice(0, 10);
    const entry = firstCloseInWindow(db, w.ticker, addedIso, ENTRY_WINDOW_CALENDAR_DAYS);
    if (!entry) {
      skipped.push({
        ticker: w.ticker,
        reason: tickerHasAnyCandle(db, w.ticker) ? 'no_entry_candle_within_window' : 'no_data',
      });
      continue;
    }

    const delistDate = delistDateOf(db, w.ticker, asOf);
    const candleExit = lastCloseOnOrBefore(db, w.ticker, delistDate ?? asOf);
    if (!candleExit) {
      skipped.push({ ticker: w.ticker, reason: 'no_data' });
      continue;
    }

    let status: RowStatus = 'active';
    if (delistDate) status = 'delisted';
    else if (calendarDaysBetween(candleExit.date, asOf) > STALE_GAP_CALENDAR_DAYS) status = 'stale';

    const spyEntry = firstCloseInWindow(db, 'SPY', entry.date, ENTRY_WINDOW_CALENDAR_DAYS);
    if (!spyEntry) {
      skipped.push({ ticker: w.ticker, reason: 'no_spy_entry' });
      continue;
    }

    const splitAdjFactor = priceAdjustmentFactor(db, w.ticker, entry.date, candleExit.date);
    const adjEntry = entry.close * splitAdjFactor;
    const returnPct = (candleExit.close - adjEntry) / adjEntry;
    const spyReturnPct = (spyExit.close - spyEntry.close) / spyEntry.close;

    rows.push({
      ticker: w.ticker,
      status,
      entryDate: entry.date, entryClose: entry.close,
      splitAdjFactor,
      exitDate: candleExit.date, exitClose: candleExit.close,
      returnPct,
      spyEntryClose: spyEntry.close, spyExitClose: spyExit.close,
      spyReturnPct, spyExcessPct: returnPct - spyReturnPct,
      daysHeld: calendarDaysBetween(entry.date, candleExit.date),
      delistDate,
    });
  }

  return { rows, aggregate: aggregateOf(rows), skipped, asOfDate: asOf, spyMissing: false };
}
