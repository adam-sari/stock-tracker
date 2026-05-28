import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';

const TEST_DB_DIR = path.join(process.cwd(), '.vitest-cache', 'schema-v13');
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test.db');

describe('schema v13 — backtest tables', () => {
  beforeEach(() => {
    closeDb();
    if (existsSync(TEST_DB_DIR)) rmSync(TEST_DB_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DB_DIR, { recursive: true });
    process.env.DB_PATH = TEST_DB_PATH;
    applySchema(getDb());
  });
  afterAll(() => { closeDb(); rmSync(TEST_DB_DIR, { recursive: true, force: true }); });

  it('records schema_version 13', () => {
    const row = getDb().prepare('SELECT version FROM schema_version WHERE version = 13').get();
    expect(row).toBeTruthy();
  });

  it('creates sp500_membership table', () => {
    const cols = getDb().prepare("PRAGMA table_info('sp500_membership')").all() as Array<{ name: string }>;
    const names = cols.map(c => c.name).sort();
    expect(names).toEqual(['from_date', 'ticker', 'to_date']);
  });

  it('creates backtest_scores table', () => {
    const cols = getDb().prepare("PRAGMA table_info('backtest_scores')").all() as Array<{ name: string }>;
    const names = cols.map(c => c.name).sort();
    expect(names).toEqual(['date', 'detail_json', 'score', 'signal_kind', 'ticker']);
  });

  it('creates backtest_runs table', () => {
    const cols = getDb().prepare("PRAGMA table_info('backtest_runs')").all() as Array<{ name: string }>;
    expect(cols.length).toBeGreaterThan(0);
    expect(cols.find(c => c.name === 'scoring_git_sha')).toBeTruthy();
  });

  it('is idempotent (re-apply succeeds with no error)', () => {
    applySchema(getDb());
    applySchema(getDb());
    const row = getDb().prepare('SELECT version FROM schema_version WHERE version = 13').get();
    expect(row).toBeTruthy();
  });
});
