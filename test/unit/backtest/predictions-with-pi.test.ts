import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { getDb, closeDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';
import { listPredictionsWithPI } from '@/lib/backtest/predictions-queries';

const DIR = path.join(process.cwd(), '.vitest-cache', 'preds-pi');
const DB = path.join(DIR, 'test.db');

beforeEach(() => {
  closeDb();
  if (existsSync(DIR)) rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
  process.env.DB_PATH = DB;
  applySchema(getDb());
});
afterAll(() => { closeDb(); rmSync(DIR, { recursive: true, force: true }); });

describe('listPredictionsWithPI', () => {
  it('joins prediction_intervals into rows; in_pi is true when realized is inside', () => {
    const db = getDb();
    db.prepare(`INSERT INTO backtest_scores VALUES (?, ?, ?, ?, NULL)`)
      .run('2026-04-01', 'EPAM', 'composite', 0.9);
    db.prepare(`INSERT INTO realized_returns VALUES (?, ?, 21, ?, ?, 'computed', 1)`)
      .run('2026-04-01', 'EPAM', 0.025, 0.018);  // inside [lower, upper]
    db.prepare(`INSERT INTO prediction_intervals VALUES (?, ?, 21, 0.10, ?, ?, ?, ?, 'lgbm', 1)`)
      .run('2026-04-01', 'EPAM', 0.02, -0.05, 0.08, 0.01);
    const rows = listPredictionsWithPI(db, { signalKind: 'composite' });
    expect(rows).toHaveLength(1);
    expect(rows[0].lower_21d).toBeCloseTo(-0.05);
    expect(rows[0].upper_21d).toBeCloseTo(0.08);
    expect(rows[0].in_pi_21d).toBe(true);
  });

  it('in_pi is false when realized falls outside the band', () => {
    const db = getDb();
    db.prepare(`INSERT INTO backtest_scores VALUES (?, ?, ?, ?, NULL)`)
      .run('2026-04-01', 'EPAM', 'composite', 0.9);
    db.prepare(`INSERT INTO realized_returns VALUES (?, ?, 21, ?, ?, 'computed', 1)`)
      .run('2026-04-01', 'EPAM', 0.25, 0.20);  // outside [lower, upper]
    db.prepare(`INSERT INTO prediction_intervals VALUES (?, ?, 21, 0.10, ?, ?, ?, ?, 'lgbm', 1)`)
      .run('2026-04-01', 'EPAM', 0.02, -0.05, 0.08, 0.01);
    const rows = listPredictionsWithPI(db, { signalKind: 'composite' });
    expect(rows[0].in_pi_21d).toBe(false);
  });
});
