import type Database from 'better-sqlite3';
import {
  insertRealizedReturns,
  listMissingReturnsForBacktestScores,
  listIncompleteReturnsToRetry,
  type RealizedReturnRow,
} from '@/lib/db/queries/realized-returns';

// TODO(plan-0001 M2 / Adversarial Finding 4): switch entry to close[D+1] when
// returns.py is fixed. Until then, every stored status='computed' row uses the
// (wrong but comparable-to-headline-IC) close[D] entry convention.

export const DEFAULT_HORIZONS = [1, 5, 21, 63] as const;

export type ComputeStats = {
  computed: number;
  pending: number;
  no_entry: number;
  delisted: number;
  refilled: number;
};

type WorkItem = { date: string; ticker: string; horizon: number; origin: 'new' | 'retry' };

type Calendar = {
  dates: string[];
  closes: number[];
  dateToIdx: Map<string, number>;
};

function loadCalendar(db: Database.Database, ticker: string): Calendar {
  const rows = db.prepare(
    `SELECT date, close FROM candles_daily WHERE ticker = ? ORDER BY date ASC`
  ).all(ticker) as Array<{ date: string; close: number }>;
  const dates = rows.map(r => r.date);
  const closes = rows.map(r => r.close);
  const dateToIdx = new Map<string, number>();
  for (let i = 0; i < rows.length; i++) dateToIdx.set(rows[i].date, i);
  return { dates, closes, dateToIdx };
}

function loadDelistedSet(db: Database.Database, maxCandleDate: string): Set<string> {
  const rows = db.prepare(
    `SELECT DISTINCT ticker FROM sp500_membership WHERE to_date IS NOT NULL AND to_date <= ?`
  ).all(maxCandleDate) as Array<{ ticker: string }>;
  return new Set(rows.map(r => r.ticker));
}

export function computeRealizedReturns(
  db: Database.Database,
  horizons: number[] = [...DEFAULT_HORIZONS]
): ComputeStats {
  const stats: ComputeStats = { computed: 0, pending: 0, no_entry: 0, delisted: 0, refilled: 0 };

  const maxRow = db.prepare(`SELECT MAX(date) AS d FROM candles_daily`).get() as { d: string | null };
  const maxCandleDate = maxRow.d;
  if (!maxCandleDate) return stats;

  const missing = listMissingReturnsForBacktestScores(db, horizons);
  const retry = listIncompleteReturnsToRetry(db, horizons);
  const workItems: WorkItem[] = [
    ...missing.map(m => ({ ...m, origin: 'new' as const })),
    ...retry.map(r => ({ ...r, origin: 'retry' as const })),
  ];
  if (workItems.length === 0) return stats;

  const delistedSet = loadDelistedSet(db, maxCandleDate);
  const calendarCache = new Map<string, Calendar>();
  function getCalendar(ticker: string): Calendar {
    let cal = calendarCache.get(ticker);
    if (cal === undefined) {
      cal = loadCalendar(db, ticker);
      calendarCache.set(ticker, cal);
    }
    return cal;
  }
  const spyCal = getCalendar('SPY');

  const now = Date.now();
  const out: RealizedReturnRow[] = [];

  for (const item of workItems) {
    const cal = getCalendar(item.ticker);
    const entryIdx = cal.dateToIdx.get(item.date);

    if (entryIdx === undefined) {
      out.push({
        date: item.date, ticker: item.ticker, horizon_days: item.horizon,
        return_pct: null, spy_excess_pct: null, status: 'no_entry_candle', computed_at: now,
      });
      stats.no_entry++;
      continue;
    }

    const forwardIdx = entryIdx + item.horizon;
    if (forwardIdx >= cal.dates.length) {
      const status: RealizedReturnRow['status'] = delistedSet.has(item.ticker) ? 'delisted' : 'pending';
      out.push({
        date: item.date, ticker: item.ticker, horizon_days: item.horizon,
        return_pct: null, spy_excess_pct: null, status, computed_at: now,
      });
      if (status === 'delisted') stats.delisted++; else stats.pending++;
      continue;
    }

    const entryClose = cal.closes[entryIdx];
    const forwardClose = cal.closes[forwardIdx];
    const forwardDate = cal.dates[forwardIdx];
    const return_pct = (forwardClose - entryClose) / entryClose;

    let spy_excess_pct: number | null = null;
    const spyEntryIdx = spyCal.dateToIdx.get(item.date);
    const spyExitIdx = spyCal.dateToIdx.get(forwardDate);
    if (spyEntryIdx !== undefined && spyExitIdx !== undefined) {
      const spyEntry = spyCal.closes[spyEntryIdx];
      const spyExit = spyCal.closes[spyExitIdx];
      if (spyEntry !== 0) {
        const spyReturn = (spyExit - spyEntry) / spyEntry;
        spy_excess_pct = return_pct - spyReturn;
      }
    }

    out.push({
      date: item.date, ticker: item.ticker, horizon_days: item.horizon,
      return_pct, spy_excess_pct, status: 'computed', computed_at: now,
    });
    stats.computed++;
    if (item.origin === 'retry') stats.refilled++;
  }

  insertRealizedReturns(db, out);
  return stats;
}
