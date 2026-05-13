import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';

const TEST_DB_DIR = path.join(process.cwd(), '.vitest-cache', 'schema-v2');
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test.db');

describe('schema v2', () => {
  beforeAll(() => {
    if (existsSync(TEST_DB_DIR)) rmSync(TEST_DB_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DB_DIR, { recursive: true });
    process.env.DB_PATH = TEST_DB_PATH;
    applySchema(getDb());
  });

  afterAll(() => {
    closeDb();
    rmSync(TEST_DB_DIR, { recursive: true, force: true });
  });

  const newTables = [
    'news', 'insider_txns', 'insider_sentiment_monthly', 'funds', 'fund_holdings',
    'congress_trades', 'sentiment_snapshots', 'trading_halts', 'corporate_actions',
    'earnings_calendar', 'analyst_recommendations', 'cusip_ticker_map',
  ];

  it.each(newTables)('table %s exists', (table) => {
    const row = getDb().prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(table);
    expect(row).toBeTruthy();
  });

  it('schema_version reports 2', () => {
    const v = getDb().prepare(`SELECT MAX(version) AS v FROM schema_version`).get() as { v: number };
    expect(v.v).toBe(2);
  });

  it('congress_trades.chamber check constraint rejects invalid values', () => {
    expect(() =>
      getDb().prepare(`INSERT INTO congress_trades (id,ticker,chamber,member,kind,txn_date,disclosed_at,ptr_url,source) VALUES ('x','AAPL','foo','x','Purchase','2026-01-01',0,'','test')`).run()
    ).toThrow();
  });
});
