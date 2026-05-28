import { describe, it, expect, beforeEach } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';

const DIR = path.join(process.cwd(), '.vitest-cache', 'realized-returns-schema');
const DB_PATH = path.join(DIR, 'test.db');

function reset() {
  closeDb();
  if (existsSync(DIR)) rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
  process.env.DB_PATH = DB_PATH;
}

describe('schema: realized_returns', () => {
  beforeEach(reset);

  it('table exists after applySchema', () => {
    applySchema(getDb());
    const row = getDb().prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='realized_returns'`
    ).get();
    expect(row).toBeTruthy();
  });

  it('has the expected columns', () => {
    applySchema(getDb());
    const cols = getDb().prepare(`PRAGMA table_info(realized_returns)`).all() as Array<{ name: string }>;
    const names = cols.map(c => c.name).sort();
    expect(names).toEqual(['computed_at', 'date', 'horizon_days', 'return_pct', 'spy_excess_pct', 'status', 'ticker'].sort());
  });

  it('status column has a CHECK constraint accepting only the four valid values', () => {
    applySchema(getDb());
    const db = getDb();
    for (const status of ['pending', 'no_entry_candle', 'delisted', 'computed']) {
      expect(() => db.prepare(
        `INSERT INTO realized_returns(date, ticker, horizon_days, return_pct, spy_excess_pct, status, computed_at)
         VALUES (?, ?, ?, NULL, NULL, ?, 0)`
      ).run('2024-01-02', 'AAPL', 1, status)).not.toThrow();
      db.prepare(`DELETE FROM realized_returns`).run();
    }
    expect(() => db.prepare(
      `INSERT INTO realized_returns(date, ticker, horizon_days, return_pct, spy_excess_pct, status, computed_at)
       VALUES (?, ?, ?, NULL, NULL, ?, 0)`
    ).run('2024-01-02', 'AAPL', 1, 'bogus')).toThrow();
  });
});
