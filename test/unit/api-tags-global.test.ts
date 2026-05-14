import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';
import { GET } from '@/app/api/tags/route';

const TEST_DB_DIR = path.join(process.cwd(), '.vitest-cache', 'api-tags-global');
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test.db');

describe('GET /api/tags', () => {
  beforeEach(() => {
    closeDb();
    if (existsSync(TEST_DB_DIR)) rmSync(TEST_DB_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DB_DIR, { recursive: true });
    process.env.DB_PATH = TEST_DB_PATH;
    applySchema(getDb());
  });

  afterAll(() => {
    closeDb();
    rmSync(TEST_DB_DIR, { recursive: true, force: true });
  });

  it('returns 200 with empty tags array when no tags exist', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('tags');
    expect(body.tags).toEqual([]);
  });

  it('returns all distinct tags across tickers', async () => {
    const db = getDb();
    db.prepare(`INSERT INTO tags (ticker, tag, added_at) VALUES ('AAPL', 'tech', 1000)`).run();
    db.prepare(`INSERT INTO tags (ticker, tag, added_at) VALUES ('MSFT', 'tech', 1001)`).run();
    db.prepare(`INSERT INTO tags (ticker, tag, added_at) VALUES ('TSLA', 'ev', 1002)`).run();
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tags).toEqual(['ev', 'tech']);
  });

  it('returns tags sorted alphabetically', async () => {
    const db = getDb();
    db.prepare(`INSERT INTO tags (ticker, tag, added_at) VALUES ('AAPL', 'software', 1000)`).run();
    db.prepare(`INSERT INTO tags (ticker, tag, added_at) VALUES ('AAPL', 'ai', 1001)`).run();
    db.prepare(`INSERT INTO tags (ticker, tag, added_at) VALUES ('AAPL', 'hardware', 1002)`).run();
    const res = await GET();
    const body = await res.json();
    expect(body.tags).toEqual(['ai', 'hardware', 'software']);
  });
});
