import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';
import { GET, POST } from '@/app/api/transactions/route';
import { DELETE } from '@/app/api/transactions/[id]/route';

const TEST_DB_DIR = path.join(process.cwd(), '.vitest-cache', 'api-txn');
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test.db');

function req(url: string, init: RequestInit = {}) {
  return new Request(url, init);
}

describe('GET/POST /api/transactions', () => {
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

  it('GET returns []', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('POST creates and GET returns it', async () => {
    const r1 = await POST(req('http://localhost/api/transactions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ticker: 'AAPL', kind: 'buy', qty: 10, price: 150, executed_at: '2026-01-01T14:30:00Z' }),
    }));
    expect(r1.status).toBe(201);
    const created = await r1.json();
    expect(created.ticker).toBe('AAPL');

    const r2 = await GET();
    const list = await r2.json();
    expect(list.length).toBe(1);
    expect(list[0].ticker).toBe('AAPL');
  });

  it('POST validates body and returns 400', async () => {
    const r = await POST(req('http://localhost/api/transactions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ticker: 'AAPL', kind: 'invalid', qty: -1, price: 150, executed_at: 'bad' }),
    }));
    expect(r.status).toBe(400);
    const body = await r.json();
    expect(body.error).toBeTruthy();
  });

  it('DELETE removes a transaction', async () => {
    const r1 = await POST(req('http://localhost/api/transactions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ticker: 'AAPL', kind: 'buy', qty: 10, price: 150, executed_at: '2026-01-01T14:30:00Z' }),
    }));
    const created = await r1.json();
    const r2 = await DELETE(req(`http://localhost/api/transactions/${created.id}`, { method: 'DELETE' }), { params: Promise.resolve({ id: String(created.id) }) });
    expect(r2.status).toBe(204);
    const list = await (await GET()).json();
    expect(list.length).toBe(0);
  });
});
