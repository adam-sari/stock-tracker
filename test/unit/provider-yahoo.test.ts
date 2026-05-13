import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { YahooProvider } from '@/lib/providers/yahoo';

const fixture = (name: string) =>
  JSON.parse(readFileSync(path.join(process.cwd(), 'test', 'fixtures', name), 'utf-8'));

describe('YahooProvider', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; });

  it('returns latest quote derived from meta.regularMarketPrice', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(fixture('yahoo-chart-aapl.json')), { status: 200 })) as any;
    const p = new YahooProvider();
    const q = await p.getLatestQuote('AAPL');
    expect(q!.ticker).toBe('AAPL');
    expect(q!.price).toBe(294.8);
  });

  it('parses minute bars with sessions from tradingPeriods', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(fixture('yahoo-chart-aapl.json')), { status: 200 })) as any;
    const p = new YahooProvider();
    const bars = await p.getMinuteBars('AAPL', {
      start: new Date('2026-05-13T08:00:00Z'),
      end: new Date('2026-05-13T16:00:00Z'),
      prepost: true,
    });
    expect(bars.length).toBe(3);
    expect(bars[0].session).toBe('pre');
    expect(bars[1].session).toBe('pre');
    expect(bars[2].session).toBe('regular');
  });

  it('reports degraded health when API returns 5xx', async () => {
    globalThis.fetch = vi.fn(async () => new Response('boom', { status: 503 })) as any;
    const p = new YahooProvider();
    expect((await p.health()).status).toBe('degraded');
  });
});
