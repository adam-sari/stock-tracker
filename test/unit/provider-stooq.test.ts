import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { StooqProvider } from '@/lib/providers/stooq';

describe('StooqProvider', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; });

  it('parses daily CSV into bars', async () => {
    const csv = readFileSync(path.join(process.cwd(), 'test', 'fixtures', 'stooq-aapl.csv'), 'utf-8');
    globalThis.fetch = vi.fn(async () => new Response(csv, { status: 200 })) as any;
    const p = new StooqProvider();
    const bars = await p.getDailyBars('AAPL', {
      start: new Date('2026-05-01T00:00:00Z'),
      end: new Date('2026-05-13T23:59:59Z'),
    });
    expect(bars.length).toBe(3);
    expect(bars[0].close).toBe(293.32);
    expect(bars[2].volume).toBe(45748129);
    expect(bars[2].session).toBe('regular');
  });

  it('returns null from getLatestQuote (EOD-only source)', async () => {
    const p = new StooqProvider();
    expect(await p.getLatestQuote('AAPL')).toBeNull();
  });

  it('returns [] from getMinuteBars', async () => {
    const p = new StooqProvider();
    expect((await p.getMinuteBars('AAPL', {
      start: new Date(), end: new Date(), prepost: false,
    })).length).toBe(0);
  });

  it('handles unknown ticker (Stooq returns "No data")', async () => {
    globalThis.fetch = vi.fn(async () => new Response('No data', { status: 200 })) as any;
    const p = new StooqProvider();
    const bars = await p.getDailyBars('UNKNOWN', { start: new Date(), end: new Date() });
    expect(bars.length).toBe(0);
  });
});
