import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { getDb, closeDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';
import { backfillConformalHistory } from '@/scripts/backfill-conformal-history';

const DIR = path.join(process.cwd(), '.vitest-cache', 'backfill-pid');
const DB = path.join(DIR, 'test.db');

beforeEach(() => {
  closeDb();
  if (existsSync(DIR)) rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
  process.env.DB_PATH = DB;
  applySchema(getDb());
});
afterAll(() => { closeDb(); rmSync(DIR, { recursive: true, force: true }); });

describe('backfillConformalHistory', () => {
  it('seeds prediction_intervals from historical CQR + realized rows', async () => {
    const db = getDb();
    for (let i = 0; i < 50; i++) {
      const d = `2026-03-${(i + 1).toString().padStart(2, '0')}`;
      db.prepare(`INSERT INTO cqr_quantile_preds VALUES (?, 'EPAM', 21, 0.10, ?, ?, ?, '{}', 'lgbm', 1)`)
        .run(d, -0.05, 0.05, 0.0);
      db.prepare(`INSERT INTO realized_returns VALUES (?, 'EPAM', 21, ?, ?, 'computed', ?)`)
        .run(d, 0.02, 0.015, i + 1);
    }
    const n = await backfillConformalHistory(db, { horizons: [21] });
    expect(n).toBeGreaterThan(0);
    const piRows = db.prepare(`SELECT * FROM prediction_intervals WHERE horizon_days = 21`).all();
    expect(piRows.length).toBeGreaterThan(0);
    const state = db.prepare(`SELECT updates_count FROM conformal_pid_state WHERE horizon_days = 21`).get() as any;
    expect(state.updates_count).toBe(50);
  });

  it('throws when pid_state for the horizon already has updates', async () => {
    const db = getDb();
    for (let i = 0; i < 5; i++) {
      const d = `2026-03-${(i + 1).toString().padStart(2, '0')}`;
      db.prepare(`INSERT INTO cqr_quantile_preds VALUES (?, 'EPAM', 21, 0.10, ?, ?, ?, '{}', 'lgbm', 1)`)
        .run(d, -0.05, 0.05, 0.0);
      db.prepare(`INSERT INTO realized_returns VALUES (?, 'EPAM', 21, ?, ?, 'computed', ?)`)
        .run(d, 0.02, 0.015, i + 1);
    }
    await backfillConformalHistory(db, { horizons: [21] });
    await expect(
      backfillConformalHistory(db, { horizons: [21] })
    ).rejects.toThrow(/already has/i);
  });
});
