import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { getDb, closeDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';
import { GET } from '@/app/api/conformal/[ticker]/route';

const DIR = path.join(process.cwd(), '.vitest-cache', 'conformal-route');
const DB = path.join(DIR, 'test.db');

beforeEach(() => {
  closeDb();
  if (existsSync(DIR)) rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
  process.env.DB_PATH = DB;
  applySchema(getDb());
});
afterAll(() => { closeDb(); rmSync(DIR, { recursive: true, force: true }); });

function ctx(ticker: string) {
  return { params: Promise.resolve({ ticker }) };
}

describe('/api/conformal/[ticker]', () => {
  it('returns 200 with empty rows when no intervals exist', async () => {
    const r = await GET(new Request('http://x/api/conformal/EPAM'), ctx('EPAM'));
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.rows).toEqual([]);
  });

  it('returns 200 with rows when intervals exist', async () => {
    getDb().prepare(`INSERT INTO prediction_intervals VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run('2026-05-29', 'EPAM', 21, 0.10, 0.02, -0.05, 0.08, 0.01, 'lgbm', 1);
    const r = await GET(new Request('http://x/api/conformal/EPAM'), ctx('EPAM'));
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].horizon_days).toBe(21);
  });

  it('returns 400 on invalid ticker', async () => {
    const r = await GET(new Request('http://x/api/conformal/invalid$'), ctx('invalid$'));
    expect(r.status).toBe(400);
  });
});
