import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';
import { runPidIntervalUpdate, HORIZONS, JOINT_ALPHA } from '@/lib/jobs/update-pid-intervals';

const DIR = path.join(process.cwd(), '.vitest-cache', 'pid-job');
const DB = path.join(DIR, 'test.db');

beforeEach(() => {
  closeDb();
  if (existsSync(DIR)) rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
  process.env.DB_PATH = DB;
  applySchema(getDb());
});
afterAll(() => { closeDb(); rmSync(DIR, { recursive: true, force: true }); });

function seedCqrAndRealizations() {
  const db = getDb();
  for (let i = 0; i < 30; i++) {
    const d = `2026-04-${(i + 1).toString().padStart(2, '0')}`;
    db.prepare(`INSERT INTO cqr_quantile_preds VALUES (?, 'EPAM', 21, 0.10, ?, ?, ?, '{}', 'lgbm-v1', 1)`)
      .run(d, -0.05, 0.05, 0.0);
    db.prepare(`INSERT INTO realized_returns VALUES (?, 'EPAM', 21, ?, ?, 'computed', ?)`)
      .run(d, 0.02, 0.01, i + 1);
  }
}

describe('runPidIntervalUpdate', () => {
  it('writes prediction_intervals for each (date, ticker, horizon) with CQR predictions and a realized close', async () => {
    seedCqrAndRealizations();
    const n = await runPidIntervalUpdate(getDb(), { horizons: [21], jointAlpha: JOINT_ALPHA });
    expect(n).toBeGreaterThan(0);
    const rows = getDb().prepare(`SELECT * FROM prediction_intervals WHERE horizon_days = 21`).all() as any[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].lower).toBeLessThan(rows[0].upper);
  });

  it('updates the conformal_pid_state for each horizon', async () => {
    seedCqrAndRealizations();
    await runPidIntervalUpdate(getDb(), { horizons: [21], jointAlpha: JOINT_ALPHA });
    const state = getDb().prepare(`SELECT * FROM conformal_pid_state WHERE horizon_days = 21`).get() as any;
    expect(state).toBeTruthy();
    expect(state.updates_count).toBeGreaterThan(0);
  });

  it('exposes the four default horizons', () => {
    expect(HORIZONS).toEqual([1, 5, 21, 63]);
    expect(JOINT_ALPHA).toBeCloseTo(0.10);
  });

  it('is idempotent on a second run (does not double-update PID state)', async () => {
    seedCqrAndRealizations();
    await runPidIntervalUpdate(getDb(), { horizons: [21], jointAlpha: JOINT_ALPHA });
    const s1 = getDb().prepare(`SELECT updates_count FROM conformal_pid_state WHERE horizon_days = 21`).get() as any;
    await runPidIntervalUpdate(getDb(), { horizons: [21], jointAlpha: JOINT_ALPHA });
    const s2 = getDb().prepare(`SELECT updates_count FROM conformal_pid_state WHERE horizon_days = 21`).get() as any;
    expect(s2.updates_count).toBe(s1.updates_count);
  });
});
