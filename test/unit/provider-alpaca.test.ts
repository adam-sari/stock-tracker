import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { AlpacaProvider } from '@/lib/providers/alpaca';

const fixture = (name: string) =>
  JSON.parse(readFileSync(path.join(process.cwd(), 'test', 'fixtures', name), 'utf-8'));

describe('AlpacaProvider', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; });

  it('parses snapshot response and prefers latestTrade price over quote midpoint', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(fixture('alpaca-snapshot-aapl.json')), { status: 200 })) as any;
    const p = new AlpacaProvider({ keyId: 'X', secret: 'Y', dataBaseUrl: 'https://data.alpaca.markets' });
    const q = await p.getLatestQuote('AAPL');
    expect(q).not.toBeNull();
    expect(q!.ticker).toBe('AAPL');
    expect(q!.bid).toBe(279.56);
    expect(q!.ask).toBe(294.39);
    // Crucially: price = latestTrade.p, NOT bid/ask midpoint (the bug we fixed)
    expect(q!.price).toBe(294.38);
  });

  it('falls back to minuteBar.close when no trade present', async () => {
    const noTradeFixture = { AAPL: { ...fixture('alpaca-snapshot-aapl.json').AAPL, latestTrade: undefined } };
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(noTradeFixture), { status: 200 })) as any;
    const p = new AlpacaProvider({ keyId: 'X', secret: 'Y', dataBaseUrl: 'https://data.alpaca.markets' });
    const q = await p.getLatestQuote('AAPL');
    expect(q!.price).toBe(294.30); // minuteBar.c
  });

  it('parses minute bars and tags sessions correctly', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(fixture('alpaca-bars-aapl.json')), { status: 200 })) as any;
    const p = new AlpacaProvider({ keyId: 'X', secret: 'Y', dataBaseUrl: 'https://data.alpaca.markets' });
    const bars = await p.getMinuteBars('AAPL', {
      start: new Date('2026-05-13T08:00:00Z'),
      end: new Date('2026-05-13T09:00:00Z'),
      prepost: true,
    });
    expect(bars.length).toBe(3);
    expect(bars[0].session).toBe('pre');
    expect(bars[0].close).toBe(294.21);
  });

  it('reports degraded health on 401', async () => {
    globalThis.fetch = vi.fn(async () => new Response('unauthorized', { status: 401 })) as any;
    const p = new AlpacaProvider({ keyId: 'BAD', secret: 'BAD', dataBaseUrl: 'https://data.alpaca.markets' });
    const h = await p.health();
    expect(h.status).toBe('down');
  });

  it('returns null when quote endpoint 404s', async () => {
    globalThis.fetch = vi.fn(async () => new Response('not found', { status: 404 })) as any;
    const p = new AlpacaProvider({ keyId: 'X', secret: 'Y', dataBaseUrl: 'https://data.alpaca.markets' });
    expect(await p.getLatestQuote('FAKE')).toBeNull();
  });
});
