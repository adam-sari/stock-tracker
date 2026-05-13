import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';
import { GET, POST } from '@/app/api/watchlist/route';
import { DELETE } from '@/app/api/watchlist/[ticker]/route';

const TEST_DB_DIR = path.join(process.cwd(), '.vitest-cache', 'api-watchlist');
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test.db');

describe('/api/watchlist', () => {
  beforeEach(() => {
    closeDb();
    if (existsSync(TEST_DB_DIR)) rmSync(TEST_DB_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DB_DIR, { recursive: true });
    process.env.DB_PATH = TEST_DB_PATH;
    applySchema(getDb());
  });
  afterAll(() => { closeDb(); rmSync(TEST_DB_DIR, { recursive: true, force: true }); });

  it('POST adds, GET returns, DELETE removes', async () => {
    const r1 = await POST(new Request('http://x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ticker: 'AAPL', source: 'manual' }) }));
    expect(r1.status).toBe(201);
    const list = await (await GET()).json();
    expect(list.watchlist.length).toBe(1);
    expect(list.watchlist[0].ticker).toBe('AAPL');

    const r2 = await DELETE(new Request('http://x', { method: 'DELETE' }), { params: Promise.resolve({ ticker: 'AAPL' }) });
    expect(r2.status).toBe(204);
    const list2 = await (await GET()).json();
    expect(list2.watchlist.length).toBe(0);
  });

  it('POST validates body', async () => {
    const r = await POST(new Request('http://x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) }));
    expect(r.status).toBe(400);
  });
});
