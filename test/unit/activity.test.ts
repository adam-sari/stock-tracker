import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';
import { upsertNews } from '@/lib/db/queries/news';
import { upsertInsiderTxns } from '@/lib/db/queries/insider';
import { listActivityForTicker } from '@/lib/db/queries/activity';

const TEST_DB_DIR = path.join(process.cwd(), '.vitest-cache', 'activity');
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test.db');

describe('listActivityForTicker', () => {
  beforeEach(() => {
    closeDb();
    if (existsSync(TEST_DB_DIR)) rmSync(TEST_DB_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DB_DIR, { recursive: true });
    process.env.DB_PATH = TEST_DB_PATH;
    applySchema(getDb());
  });
  afterAll(() => { closeDb(); rmSync(TEST_DB_DIR, { recursive: true, force: true }); });

  it('mixes events across sources and sorts by ts DESC', () => {
    upsertNews([
      { id: 'n1', ticker: 'AAPL', headline: 'older news', url: 'https://x/n1', source: 'finnhub', published_at: 100, fetched_at: 100 },
      { id: 'n2', ticker: 'AAPL', headline: 'newer news', url: 'https://x/n2', source: 'finnhub', published_at: 300, fetched_at: 300 },
    ]);
    upsertInsiderTxns([
      { id: 'i1', ticker: 'AAPL', insider_name: 'CEO', code: 'P', is_derivative: 0, shares: 100, txn_date: '2026-01-01', filed_at: 200, source: 'edgar' },
    ]);

    const events = listActivityForTicker('AAPL');
    expect(events.length).toBe(3);
    expect(events[0].kind).toBe('news');
    expect(events[0].title).toBe('newer news');
    expect(events[1].kind).toBe('insider');
    expect(events[2].kind).toBe('news');
    expect(events[2].title).toBe('older news');
  });

  it('returns [] for ticker with no data', () => {
    expect(listActivityForTicker('AAPL').length).toBe(0);
  });
});
