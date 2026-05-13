import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';
import { addTag, removeTag, listTagsForTicker, listAllTags, listTagsByTickerMap } from '@/lib/db/queries/tags';

const TEST_DB_DIR = path.join(process.cwd(), '.vitest-cache', 'tags');
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test.db');

describe('tags queries', () => {
  beforeEach(() => {
    closeDb();
    if (existsSync(TEST_DB_DIR)) rmSync(TEST_DB_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DB_DIR, { recursive: true });
    process.env.DB_PATH = TEST_DB_PATH;
    applySchema(getDb());
  });
  afterAll(() => { closeDb(); rmSync(TEST_DB_DIR, { recursive: true, force: true }); });

  it('addTag normalises ticker uppercase and tag lowercase', () => {
    addTag('aapl', 'Tech');
    expect(listTagsForTicker('AAPL')).toEqual(['tech']);
  });

  it('listAllTags returns distinct tags sorted', () => {
    addTag('AAPL', 'tech');
    addTag('NVDA', 'tech');
    addTag('NVDA', 'ai');
    expect(listAllTags()).toEqual(['ai', 'tech']);
  });

  it('listTagsByTickerMap groups tags per ticker', () => {
    addTag('AAPL', 'tech');
    addTag('AAPL', 'consumer');
    addTag('NVDA', 'ai');
    const map = listTagsByTickerMap();
    expect(map.get('AAPL')?.sort()).toEqual(['consumer', 'tech']);
    expect(map.get('NVDA')).toEqual(['ai']);
  });

  it('removeTag deletes only the specific pair', () => {
    addTag('AAPL', 'tech');
    addTag('AAPL', 'consumer');
    removeTag('AAPL', 'tech');
    expect(listTagsForTicker('AAPL')).toEqual(['consumer']);
  });

  it('addTag is idempotent', () => {
    addTag('AAPL', 'tech');
    addTag('AAPL', 'tech');
    expect(listTagsForTicker('AAPL')).toEqual(['tech']);
  });
});
