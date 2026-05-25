import type Database from 'better-sqlite3';
import { execSync } from 'node:child_process';
import type { SignalKind } from '@/lib/computations/discovery';
import { scoreVolumeBreakout, scoreInsiderClusters, scoreCongressBuys, score13FAccumulation, scoreHaltEvents, scoreSentimentSurge } from '@/lib/computations/discovery';
import { readCandlesAsOf, readInsiderAsOf, readCongressAsOf, readFundsAsOf, readHaltsAsOf, readSentimentAsOf, asOfEpoch } from './asof-readers';

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
  const sha = (() => {
    try { return execSync('git rev-parse --short HEAD').toString().trim(); }
    catch { return 'unknown'; }
  })();
  const started = Math.floor(Date.now() / 1000);
  const ins = db.prepare(
    `INSERT INTO backtest_runs (started_at, status, from_date, to_date, scoring_git_sha)
     VALUES (?, 'running', ?, ?, ?)`
  ).run(started, opts.fromDate, opts.toDate, sha);
  const runId = Number(ins.lastInsertRowid);

  const all: Array<'insider' | 'congress' | 'funds' | 'halts' | 'volume' | 'sentiment'> =
    ['insider', 'congress', 'funds', 'halts', 'volume', 'sentiment'];
  const signals = (opts.signals as typeof all) ?? all;
  const perSignal: Record<string, number> = {};
  let total = 0;
  let error: string | null = null;

  try {
    for (const sig of signals) {
      let n = 0;
      switch (sig) {
        case 'insider':   n = replayInsider(db, { ...opts, lookbackDays: 30 }); break;
        case 'congress':  n = replayCongress(db, { ...opts, lookbackDays: 14 }); break;
        case 'funds':     n = replayFunds(db, opts); break;
        case 'halts':     n = replayHalts(db, { ...opts, lookbackDays: 3 }); break;
        case 'volume':    n = replayVolume(db, { ...opts, lookbackDays: 30 }); break;
        case 'sentiment': n = replaySentiment(db, { ...opts, lookbackHours: 48 }); break;
      }
      perSignal[sig] = n;
      total += n;
    }
  } catch (e) { error = (e as Error).message; }

  db.prepare(
    `UPDATE backtest_runs SET finished_at = ?, status = ?, detail = ? WHERE id = ?`
  ).run(Math.floor(Date.now() / 1000), error ? 'error' : 'ok',
        error ?? `scored=${total}`, runId);

  return { runId, scoresWritten: total, perSignal };
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

export function replayHalts(
  db: Database.Database,
  opts: { fromDate: string; toDate: string; lookbackDays?: number; tickers?: string[] },
): number {
  const lookback = opts.lookbackDays ?? 3;
  const upsert = db.prepare(
    `INSERT INTO backtest_scores (date, ticker, signal_kind, score, detail_json)
     VALUES (?, ?, 'halts', ?, ?)
     ON CONFLICT(date, ticker, signal_kind) DO UPDATE SET
       score = excluded.score, detail_json = excluded.detail_json`
  );
  let written = 0;
  const tx = db.transaction(() => {
    for (let d = new Date(`${opts.fromDate}T00:00:00Z`);
         d.toISOString().slice(0, 10) <= opts.toDate;
         d.setUTCDate(d.getUTCDate() + 1)) {
      const asOf = d.toISOString().slice(0, 10);
      const rows = readHaltsAsOf(db, asOf, lookback, opts.tickers);
      const scores = scoreHaltEvents(rows, asOfEpoch(asOf), lookback);
      for (const [ticker, e] of scores) {
        upsert.run(asOf, ticker, e.score, JSON.stringify({ reasonCode: e.reasonCode }));
        written++;
      }
    }
  });
  tx();
  return written;
}

export function replaySentiment(
  db: Database.Database,
  opts: { fromDate: string; toDate: string; lookbackHours?: number; tickers?: string[] },
): number {
  const lookback = opts.lookbackHours ?? 48;
  const upsert = db.prepare(
    `INSERT INTO backtest_scores (date, ticker, signal_kind, score, detail_json)
     VALUES (?, ?, 'sentiment', ?, ?)
     ON CONFLICT(date, ticker, signal_kind) DO UPDATE SET
       score = excluded.score, detail_json = excluded.detail_json`
  );
  let written = 0;
  const tx = db.transaction(() => {
    for (let d = new Date(`${opts.fromDate}T00:00:00Z`);
         d.toISOString().slice(0, 10) <= opts.toDate;
         d.setUTCDate(d.getUTCDate() + 1)) {
      const asOf = d.toISOString().slice(0, 10);
      const rows = readSentimentAsOf(db, asOf, lookback, opts.tickers);
      const scores = scoreSentimentSurge(rows, lookback, asOfEpoch(asOf));
      for (const [ticker, e] of scores) {
        upsert.run(asOf, ticker, e.score,
          JSON.stringify({ latestMentions: e.latestMentions, surgePct: e.surgePct }));
        written++;
      }
    }
  });
  tx();
  return written;
}
