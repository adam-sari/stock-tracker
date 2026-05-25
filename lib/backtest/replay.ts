import type Database from 'better-sqlite3';
import type { SignalKind } from '@/lib/computations/discovery';

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
