import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ApewisdomClient } from '@/lib/providers/apewisdom';

const fixture = JSON.parse(readFileSync(path.join(process.cwd(), 'test', 'fixtures', 'apewisdom-top.json'), 'utf-8'));

describe('ApewisdomClient', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; });

  it('getTopStocks returns parsed top-N rankings', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(fixture), { status: 200 })) as any;
    const c = new ApewisdomClient();
    const top = await c.getTopStocks();
    expect(top.length).toBe(3);
    expect(top[0].ticker).toBe('MU');
    expect(top[0].mentions).toBe(1445);
  });

  it('filterToUniverse keeps only requested tickers', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(fixture), { status: 200 })) as any;
    const c = new ApewisdomClient();
    const filtered = await c.getForTickers(['AAPL', 'NVDA']);
    expect(filtered.length).toBe(1);
    expect(filtered[0].ticker).toBe('AAPL');
  });
});
