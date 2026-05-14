import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';
import { GET } from '@/app/api/holdings/route';

const TEST_DB_DIR = path.join(process.cwd(), '.vitest-cache', 'api-holdings');
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test.db');

describe('GET /api/holdings', () => {
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

  it('returns 200 with an empty array when no holdings', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(0);
  });

  it('returns holdings after a buy transaction', async () => {
    getDb()
      .prepare(`INSERT INTO transactions (ticker, kind, qty, price, executed_at) VALUES ('AAPL', 'buy', 10, 150, 1735732200)`)
      .run();
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].ticker).toBe('AAPL');
    expect(body[0].qty).toBe(10);
    expect(body[0].avg_cost).toBe(150);
  });

  it('excludes fully sold positions', async () => {
    const db = getDb();
    db.prepare(`INSERT INTO transactions (ticker, kind, qty, price, executed_at) VALUES ('AAPL', 'buy', 10, 150, 1735732200)`).run();
    db.prepare(`INSERT INTO transactions (ticker, kind, qty, price, executed_at) VALUES ('AAPL', 'sell', 10, 160, 1735818600)`).run();
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(0);
  });

  it('returns multiple holdings sorted alphabetically', async () => {
    const db = getDb();
    db.prepare(`INSERT INTO transactions (ticker, kind, qty, price, executed_at) VALUES ('TSLA', 'buy', 5, 200, 1735732200)`).run();
    db.prepare(`INSERT INTO transactions (ticker, kind, qty, price, executed_at) VALUES ('AAPL', 'buy', 10, 150, 1735732200)`).run();
    const res = await GET();
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0].ticker).toBe('AAPL');
    expect(body[1].ticker).toBe('TSLA');
  });
});
