import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { NasdaqCalendarClient } from '@/lib/providers/nasdaq-calendar';

const fixture = JSON.parse(readFileSync(path.join(process.cwd(), 'test', 'fixtures', 'nasdaq-earnings.json'), 'utf-8'));

describe('NasdaqCalendarClient', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; });

  it('parses earnings for a given date', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(fixture), { status: 200 })) as any;
    const c = new NasdaqCalendarClient();
    const cal = await c.getEarningsByDate(new Date('2026-05-13'));
    expect(cal.length).toBe(2);
    const csco = cal.find(e => e.ticker === 'CSCO')!;
    expect(csco.epsForecast).toBe(0.86);
    expect(csco.hour).toBe('amc');
    expect(csco.numEstimates).toBe(6);
  });

  it('returns [] when nasdaq returns empty data', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ data: { rows: null } }), { status: 200 })) as any;
    const c = new NasdaqCalendarClient();
    expect((await c.getEarningsByDate(new Date('2026-05-13'))).length).toBe(0);
  });
});
