import type Database from 'better-sqlite3';
import type { SignalKind } from '@/lib/computations/discovery';
import { scoreVolumeBreakout, scoreInsiderClusters, scoreCongressBuys, score13FAccumulation } from '@/lib/computations/discovery';
import { readCandlesAsOf, readInsiderAsOf, readCongressAsOf, readFundsAsOf, asOfEpoch } from './asof-readers';

export type ReplayOpts = {
  fromDate: string;        // YYYY-MM-DD inclusive
  toDate: string;          // YYYY-MM-DD inclusive
  tickers?: string[];      // default: all distinct tickers in candles_daily within window
  signals?: SignalKind[];  // default: all 6
};

export type ReplayResult = {
  runId: number;
  scoresWritten: number;
  perSignal: Record<string, number>;
};

/**
 * Walk every (date, ticker) in the backtest window and write per-signal scores
 * to `backtest_scores`. Reads existing tables only. Strict as-of semantics:
 * a score for date D uses only data with timestamp <= D.
 *
 * Per-signal implementations are added in subsequent tasks.
 */
export async function replayAllSignals(
  db: Database.Database,
  opts: ReplayOpts,
): Promise<ReplayResult> {
  // Per-signal calls are wired in their own tasks.
  throw new Error('not implemented yet — per-signal calls wired in tasks 4-9');
}

/**
 * Replay scoreVolumeBreakout over a date range.
 * For each date in [fromDate, toDate], call the production scoring function
 * with only candles dated <= that date. Write to backtest_scores.
 */
export function replayVolume(
  db: Database.Database,
  opts: { fromDate: string; toDate: string; lookbackDays?: number; tickers?: string[] },
): number {
  const lookback = opts.lookbackDays ?? 30;
  const upsert = db.prepare(
    `INSERT INTO backtest_scores (date, ticker, signal_kind, score, detail_json)
     VALUES (?, ?, 'volume', ?, ?)
     ON CONFLICT(date, ticker, signal_kind) DO UPDATE SET
       score = excluded.score, detail_json = excluded.detail_json`
  );
  let written = 0;
  const tx = db.transaction(() => {
    for (let d = new Date(`${opts.fromDate}T00:00:00Z`);
         d.toISOString().slice(0, 10) <= opts.toDate;
         d.setUTCDate(d.getUTCDate() + 1)) {
      const asOf = d.toISOString().slice(0, 10);
      const rows = readCandlesAsOf(db, asOf, lookback, opts.tickers);
      const scores = scoreVolumeBreakout(rows, lookback);
      for (const [ticker, e] of scores) {
        upsert.run(asOf, ticker, e.score,
          JSON.stringify({ latestVolume: e.latestVolume, avgPriorVolume: e.avgPriorVolume }));
        written++;
      }
    }
  });
  tx();
  return written;
}

export function replayInsider(
  db: Database.Database,
  opts: { fromDate: string; toDate: string; lookbackDays?: number; tickers?: string[] },
): number {
  const lookback = opts.lookbackDays ?? 30;
  const upsert = db.prepare(
    `INSERT INTO backtest_scores (date, ticker, signal_kind, score, detail_json)
     VALUES (?, ?, 'insider', ?, ?)
     ON CONFLICT(date, ticker, signal_kind) DO UPDATE SET
       score = excluded.score, detail_json = excluded.detail_json`
  );
  let written = 0;
  const tx = db.transaction(() => {
    for (let d = new Date(`${opts.fromDate}T00:00:00Z`);
         d.toISOString().slice(0, 10) <= opts.toDate;
         d.setUTCDate(d.getUTCDate() + 1)) {
      const asOf = d.toISOString().slice(0, 10);
      const rows = readInsiderAsOf(db, asOf, lookback, opts.tickers);
      const scores = scoreInsiderClusters(rows, asOfEpoch(asOf), lookback);
      for (const [ticker, e] of scores) {
        upsert.run(asOf, ticker, e.score, JSON.stringify({ distinctBuyers: e.distinctBuyers }));
        written++;
      }
    }
  });
  tx();
  return written;
}

export function replayCongress(
  db: Database.Database,
  opts: { fromDate: string; toDate: string; lookbackDays?: number; tickers?: string[] },
): number {
  const lookback = opts.lookbackDays ?? 14;
  const upsert = db.prepare(
    `INSERT INTO backtest_scores (date, ticker, signal_kind, score, detail_json)
     VALUES (?, ?, 'congress', ?, ?)
     ON CONFLICT(date, ticker, signal_kind) DO UPDATE SET
       score = excluded.score, detail_json = excluded.detail_json`
  );
  let written = 0;
  const tx = db.transaction(() => {
    for (let d = new Date(`${opts.fromDate}T00:00:00Z`);
         d.toISOString().slice(0, 10) <= opts.toDate;
         d.setUTCDate(d.getUTCDate() + 1)) {
      const asOf = d.toISOString().slice(0, 10);
      const rows = readCongressAsOf(db, asOf, lookback, opts.tickers);
      const scores = scoreCongressBuys(rows, asOfEpoch(asOf), lookback);
      for (const [ticker, e] of scores) {
        upsert.run(asOf, ticker, e.score, JSON.stringify({ buys: e.buys, sales: e.sales }));
        written++;
      }
    }
  });
  tx();
  return written;
}

export function replayFunds(
  db: Database.Database,
  opts: { fromDate: string; toDate: string; tickers?: string[] },
): number {
  const upsert = db.prepare(
    `INSERT INTO backtest_scores (date, ticker, signal_kind, score, detail_json)
     VALUES (?, ?, 'funds', ?, ?)
     ON CONFLICT(date, ticker, signal_kind) DO UPDATE SET
       score = excluded.score, detail_json = excluded.detail_json`
  );
  let written = 0;
  const tx = db.transaction(() => {
    for (let d = new Date(`${opts.fromDate}T00:00:00Z`);
         d.toISOString().slice(0, 10) <= opts.toDate;
         d.setUTCDate(d.getUTCDate() + 1)) {
      const asOf = d.toISOString().slice(0, 10);
      const rows = readFundsAsOf(db, asOf, opts.tickers);
      const scores = score13FAccumulation(rows);
      for (const [ticker, e] of scores) {
        upsert.run(asOf, ticker, e.score, JSON.stringify({ accumulators: e.accumulators }));
        written++;
      }
    }
  });
  tx();
  return written;
}
