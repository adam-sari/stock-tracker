import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { getDb, closeDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';
import {
  upsertCqrPred, getCqrPredsForDate,
  upsertPredictionInterval, getPredictionIntervalsForTicker,
  getOrInitPidState, updatePidState,
} from '@/lib/db/queries/conformal';

const DIR = path.join(process.cwd(), '.vitest-cache', 'conformal-q');
const DB = path.join(DIR, 'test.db');

beforeEach(() => {
  closeDb();
  if (existsSync(DIR)) rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
  process.env.DB_PATH = DB;
  applySchema(getDb());
});
afterAll(() => { closeDb(); rmSync(DIR, { recursive: true, force: true }); });

describe('conformal DB queries', () => {
  it('upsertCqrPred + getCqrPredsForDate roundtrip', () => {
    upsertCqrPred({
      date: '2026-05-29', ticker: 'EPAM', horizon_days: 21, alpha: 0.10,
      q_lo: -0.05, q_hi: 0.08, point_pred: 0.02,
      features_json: '{"composite":0.9}', model_version: 'lgbm-v1', trained_at: 1,
    });
    const rows = getCqrPredsForDate('2026-05-29', 21);
    expect(rows).toHaveLength(1);
    expect(rows[0].ticker).toBe('EPAM');
    expect(rows[0].q_hi).toBeCloseTo(0.08);
  });

  it('upsertCqrPred replaces on duplicate primary key', () => {
    const base = { date: '2026-05-29', ticker: 'EPAM', horizon_days: 21, alpha: 0.10,
      q_lo: -0.05, q_hi: 0.08, point_pred: 0.02,
      features_json: '{}', model_version: 'lgbm-v1', trained_at: 1 };
    upsertCqrPred(base);
    upsertCqrPred({ ...base, q_hi: 0.12, model_version: 'lgbm-v2' });
    const rows = getCqrPredsForDate('2026-05-29', 21);
    expect(rows).toHaveLength(1);
    expect(rows[0].q_hi).toBeCloseTo(0.12);
    expect(rows[0].model_version).toBe('lgbm-v2');
  });

  it('upsertPredictionInterval + getPredictionIntervalsForTicker', () => {
    upsertPredictionInterval({
      date: '2026-05-29', ticker: 'EPAM', horizon_days: 21, alpha: 0.10,
      point_pred: 0.02, lower: -0.06, upper: 0.10, pid_threshold: 0.01,
      source_model_version: 'lgbm-v1', computed_at: 5,
    });
    const rows = getPredictionIntervalsForTicker('EPAM');
    expect(rows).toHaveLength(1);
    expect(rows[0].lower).toBeCloseTo(-0.06);
  });

  it('getOrInitPidState returns zeros on first call, persists thereafter', () => {
    const s1 = getOrInitPidState(21, 0.10);
    expect(s1.q_t).toBe(0);
    expect(s1.updates_count).toBe(0);
    expect(s1.empirical_coverage).toBeNull();
    updatePidState({ horizon_days: 21, alpha: 0.10, q_t: 0.05, integral: 0.01,
      prev_err: 0.1, updates_count: 1, empirical_coverage: 0.9, updated_at: 7 });
    const s2 = getOrInitPidState(21, 0.10);
    expect(s2.q_t).toBeCloseTo(0.05);
    expect(s2.updates_count).toBe(1);
  });
});
