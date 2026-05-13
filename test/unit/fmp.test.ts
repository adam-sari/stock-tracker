import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { FmpClient } from '@/lib/providers/fmp';

const fixture = (name: string) =>
  JSON.parse(readFileSync(path.join(process.cwd(), 'test', 'fixtures', name), 'utf-8'));

function mockFetch(body: unknown, status = 200) {
  globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(body), { status })) as any;
}

describe('FmpClient', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; });

  it('getProfile parses /stable/profile', async () => {
    mockFetch(fixture('fmp-profile-aapl.json'));
    const c = new FmpClient({ apiKey: 'k' });
    const p = await c.getProfile('AAPL');
    expect(p!.ticker).toBe('AAPL');
    expect(p!.description).toContain('Apple Inc.');
    expect(p!.ceo).toContain('Cook');
    expect(p!.employees).toBe(164000);
  });

  it('getSenateLatest parses /stable/senate-latest', async () => {
    mockFetch(fixture('fmp-senate-latest.json'));
    const c = new FmpClient({ apiKey: 'k' });
    const trades = await c.getSenateLatest();
    expect(trades.length).toBe(2);
    expect(trades[1].ticker).toBe('AAPL');
    expect(trades[1].kind).toBe('Sale');
    expect(trades[1].amountLow).toBe(15001);
    expect(trades[1].amountHigh).toBe(50000);
  });

  it('getHouseLatest parses /stable/house-latest', async () => {
    mockFetch(fixture('fmp-house-latest.json'));
    const c = new FmpClient({ apiKey: 'k' });
    const trades = await c.getHouseLatest();
    expect(trades[0].ticker).toBe('AESI');
    expect(trades[0].district).toBe('TX21');
    expect(trades[0].amountHigh).toBe(250000);
  });

  it('getEarningsCalendar parses /stable/earnings-calendar', async () => {
    mockFetch(fixture('fmp-earnings-calendar.json'));
    const c = new FmpClient({ apiKey: 'k' });
    const cal = await c.getEarningsCalendar();
    expect(cal.length).toBe(2);
    expect(cal[0].symbol).toBe('CSCO');
    expect(cal[0].epsEstimate).toBe(1.04);
  });

  it('getDividends parses /stable/dividends', async () => {
    mockFetch(fixture('fmp-dividends-aapl.json'));
    const c = new FmpClient({ apiKey: 'k' });
    const divs = await c.getDividends('AAPL');
    expect(divs.length).toBe(2);
    expect(divs[0].dividend).toBe(0.27);
    expect(divs[0].frequency).toBe('Quarterly');
  });

  it('throws on 402 (paid-only endpoint)', async () => {
    mockFetch('Restricted Endpoint', 402);
    const c = new FmpClient({ apiKey: 'k' });
    await expect(c.getProfile('AAPL')).rejects.toThrow(/402/);
  });
});
