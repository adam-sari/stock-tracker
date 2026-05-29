import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { getDb, closeDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';

const DIR = path.join(process.cwd(), '.vitest-cache', 'schema-v15');
const DB = path.join(DIR, 'test.db');

beforeAll(() => {
  if (existsSync(DIR)) rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
  process.env.DB_PATH = DB;
  applySchema(getDb());
});
afterAll(() => { closeDb(); rmSync(DIR, { recursive: true, force: true }); });

function columns(table: string): string[] {
  return (getDb().prepare(`PRAGMA table_info(${table})`).all() as any[])
    .map(r => r.name);
}

describe('schema v15', () => {
  it('bumps schema_version to >= 15', () => {
    const v = (getDb().prepare('SELECT MAX(version) AS v FROM schema_version').get() as any).v;
    expect(v).toBeGreaterThanOrEqual(15);
  });

  it('creates cqr_quantile_preds with expected columns', () => {
    const cols = columns('cqr_quantile_preds');
    for (const c of ['date', 'ticker', 'horizon_days', 'alpha', 'q_lo', 'q_hi',
                     'point_pred', 'features_json', 'model_version', 'trained_at']) {
      expect(cols).toContain(c);
    }
  });

  it('creates prediction_intervals with expected columns', () => {
    const cols = columns('prediction_intervals');
    for (const c of ['date', 'ticker', 'horizon_days', 'alpha', 'point_pred',
                     'lower', 'upper', 'pid_threshold', 'source_model_version',
                     'computed_at']) {
      expect(cols).toContain(c);
    }
  });

  it('creates conformal_pid_state with expected columns', () => {
    const cols = columns('conformal_pid_state');
    for (const c of ['horizon_days', 'alpha', 'q_t', 'integral', 'prev_err',
                     'updates_count', 'empirical_coverage', 'updated_at']) {
      expect(cols).toContain(c);
    }
  });
});
