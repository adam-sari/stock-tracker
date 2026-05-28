import type Database from 'better-sqlite3';

export type BacktestHistoryRow = {
  date: string;
  ticker: string;
  signal_kind: string;
  score: number;
  detail_json: string;
};

export function getBacktestHistoryForTicker(
  db: Database.Database,
  ticker: string,
  days: number,
): BacktestHistoryRow[] {
  return db.prepare(`
    SELECT date, ticker, signal_kind, score, detail_json
    FROM backtest_scores
    WHERE ticker = ? AND date >= date('now', '-' || ? || ' day')
    ORDER BY date DESC, signal_kind ASC
  `).all(ticker, days) as BacktestHistoryRow[];
}
