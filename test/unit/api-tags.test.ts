import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';
import { GET, POST, DELETE } from '@/app/api/stock/[ticker]/tags/route';

const TEST_DB_DIR = path.join(process.cwd(), '.vitest-cache', 'api-tags');
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test.db');

describe('/api/stock/[ticker]/tags', () => {
  beforeEach(() => {
    closeDb();
    if (existsSync(TEST_DB_DIR)) rmSync(TEST_DB_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DB_DIR, { recursive: true });
    process.env.DB_PATH = TEST_DB_PATH;
    applySchema(getDb());
  });
  afterAll(() => { closeDb(); rmSync(TEST_DB_DIR, { recursive: true, force: true }); });

  const tickerParam = (t: string) => ({ params: Promise.resolve({ ticker: t }) });

  it('POST adds, GET lists, DELETE removes', async () => {
    const r1 = await POST(new Request('http://x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tag: 'Tech' }) }), tickerParam('AAPL'));
    expect(r1.status).toBe(201);
    const list = await (await GET(new Request('http://x'), tickerParam('AAPL'))).json();
    expect(list.tags).toEqual(['tech']);

    const r2 = await DELETE(new Request('http://x/api/stock/AAPL/tags?tag=tech', { method: 'DELETE' }), tickerParam('AAPL'));
    expect(r2.status).toBe(204);
    const list2 = await (await GET(new Request('http://x'), tickerParam('AAPL'))).json();
    expect(list2.tags).toEqual([]);
  });

  it('POST rejects empty tag', async () => {
    const r = await POST(new Request('http://x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tag: '' }) }), tickerParam('AAPL'));
    expect(r.status).toBe(400);
  });
});
