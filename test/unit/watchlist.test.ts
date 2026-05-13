import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';
import { addToWatchlist, removeFromWatchlist, listWatchlist } from '@/lib/db/queries/watchlist';

const TEST_DB_DIR = path.join(process.cwd(), '.vitest-cache', 'watchlist');
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test.db');

describe('watchlist', () => {
  beforeEach(() => {
    closeDb();
    if (existsSync(TEST_DB_DIR)) rmSync(TEST_DB_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DB_DIR, { recursive: true });
    process.env.DB_PATH = TEST_DB_PATH;
    applySchema(getDb());
  });
  afterAll(() => { closeDb(); rmSync(TEST_DB_DIR, { recursive: true, force: true }); });

  it('addToWatchlist upserts and uppercases ticker', () => {
    addToWatchlist('aapl', 'manual');
    addToWatchlist('NVDA', 'discovery', 'high cluster score');
    const items = listWatchlist();
    expect(items.map(i => i.ticker).sort()).toEqual(['AAPL', 'NVDA']);
    expect(items.find(i => i.ticker === 'NVDA')!.source).toBe('discovery');
    expect(items.find(i => i.ticker === 'NVDA')!.note).toBe('high cluster score');
  });

  it('removeFromWatchlist deletes', () => {
    addToWatchlist('AAPL', 'manual');
    removeFromWatchlist('AAPL');
    expect(listWatchlist().length).toBe(0);
  });

  it('idempotent on repeated add', () => {
    addToWatchlist('AAPL', 'manual');
    addToWatchlist('AAPL', 'discovery');  // upserts
    const items = listWatchlist();
    expect(items.length).toBe(1);
    expect(items[0].source).toBe('discovery');
  });
});
