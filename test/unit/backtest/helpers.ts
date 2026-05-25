import Database from 'better-sqlite3';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';

/**
 * Create a fresh file-based test DB at `.vitest-cache/<name>/test.db`,
 * apply the schema, and return the open DB handle. Caller must call
 * `cleanupTestDb(name)` in afterAll.
 */
export function makeTestDb(name: string): Database.Database {
  const dir = path.join(process.cwd(), '.vitest-cache', `backtest-${name}`);
  const file = path.join(dir, 'test.db');
  closeDb();
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  process.env.DB_PATH = file;
  applySchema(getDb());
  return getDb();
}

export function cleanupTestDb(name: string): void {
  closeDb();
  const dir = path.join(process.cwd(), '.vitest-cache', `backtest-${name}`);
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
}

/** Convert YYYY-MM-DD to a Unix epoch second representing 00:00:00 UTC of that date. */
export function ts(date: string): number {
  return Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 1000);
}

/** Read all backtest_scores rows for a given date, indexed by ticker. */
export function readBacktestScores(
  db: Database.Database,
  date: string,
  signal: string,
): Map<string, { score: number; detail: any }> {
  const rows = db.prepare(
    `SELECT ticker, score, detail_json FROM backtest_scores
     WHERE date = ? AND signal_kind = ?`
  ).all(date, signal) as Array<{ ticker: string; score: number; detail_json: string | null }>;
  const out = new Map<string, { score: number; detail: any }>();
  for (const r of rows) {
    out.set(r.ticker, { score: r.score, detail: r.detail_json ? JSON.parse(r.detail_json) : null });
  }
  return out;
}
