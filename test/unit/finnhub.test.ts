import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { FinnhubClient } from '@/lib/providers/finnhub';

const fixture = (name: string) =>
  JSON.parse(readFileSync(path.join(process.cwd(), 'test', 'fixtures', name), 'utf-8'));

function mockFetch(body: unknown, status = 200) {
  globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(body), { status })) as any;
}

describe('FinnhubClient', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; });

  it('getQuote parses Finnhub /quote', async () => {
    mockFetch(fixture('finnhub-quote-aapl.json'));
    const c = new FinnhubClient({ apiKey: 'k' });
    const q = await c.getQuote('AAPL');
    expect(q.price).toBe(294.8);
    expect(q.change).toBe(2.12);
  });

  it('getCompanyNews parses /company-news', async () => {
    mockFetch(fixture('finnhub-news-aapl.json'));
    const c = new FinnhubClient({ apiKey: 'k' });
    const items = await c.getCompanyNews('AAPL', new Date('2026-05-06'), new Date('2026-05-13'));
    expect(items.length).toBe(2);
    expect(items[0].headline).toContain('Apple');
    expect(items[0].url).toBeTruthy();
  });

  it('getProfile parses /stock/profile2', async () => {
    mockFetch(fixture('finnhub-profile2-aapl.json'));
    const c = new FinnhubClient({ apiKey: 'k' });
    const p = await c.getProfile('AAPL');
    expect(p!.ticker).toBe('AAPL');
    expect(p!.industry).toBe('Technology');
    expect(p!.logoUrl).toContain('AAPL.png');
  });

  it('getInsiderTransactions parses /stock/insider-transactions', async () => {
    mockFetch(fixture('finnhub-insider-txns-aapl.json'));
    const c = new FinnhubClient({ apiKey: 'k' });
    const txns = await c.getInsiderTransactions('AAPL');
    expect(txns.length).toBe(2);
    expect(txns[0].code).toBe('S');
    expect(txns[0].insiderName).toBe('Borders Ben');
  });

  it('getInsiderSentiment parses monthly aggregate', async () => {
    mockFetch(fixture('finnhub-insider-sentiment-aapl.json'));
    const c = new FinnhubClient({ apiKey: 'k' });
    const months = await c.getInsiderSentiment('AAPL', new Date('2025-01-01'), new Date('2026-12-31'));
    expect(months.length).toBe(2);
    expect(months[0].mspr).toBe(25.65);
  });

  it('getRecommendation parses analyst recs', async () => {
    mockFetch(fixture('finnhub-recommendation-aapl.json'));
    const c = new FinnhubClient({ apiKey: 'k' });
    const recs = await c.getRecommendation('AAPL');
    expect(recs.length).toBe(2);
    expect(recs[0].strongBuy).toBe(15);
  });

  it('getEarningsCalendar parses /calendar/earnings', async () => {
    mockFetch(fixture('finnhub-earnings-calendar.json'));
    const c = new FinnhubClient({ apiKey: 'k' });
    const cal = await c.getEarningsCalendar(new Date('2026-05-13'), new Date('2026-05-20'));
    expect(cal.length).toBe(2);
    expect(cal.find(e => e.symbol === 'CSCO')!.epsActual).toBe(0.86);
  });

  it('throws on non-2xx', async () => {
    mockFetch({ error: 'forbidden' }, 403);
    const c = new FinnhubClient({ apiKey: 'k' });
    await expect(c.getProfile('AAPL')).rejects.toThrow(/403/);
  });
});
