import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { GET, POST } from '@/app/api/watchlist/route';
import { DELETE } from '@/app/api/watchlist/[ticker]/route';
import { makeTestDb } from '@/test/helpers/test-db';

const testDb = makeTestDb('api-watchlist');

describe('/api/watchlist', () => {
  beforeEach(testDb.reset);
  afterAll(testDb.teardown);

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
