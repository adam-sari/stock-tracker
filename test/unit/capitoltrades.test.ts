import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CapitolTradesClient, parseCapitolTradesResponse } from '@/lib/providers/capitoltrades';

const SAMPLE_RESPONSE = {
  data: [
    {
      ticker: 'AAPL',
      chamber: 'senate',
      firstName: 'Jane',
      lastName: 'Doe',
      txType: 'Sale',
      amountMin: 15001,
      amountMax: 50000,
      txDate: '2026-04-15',
      disclosureDate: '2026-05-10',
    },
    {
      ticker: 'msft',
      chamber: 'House of Representatives',
      firstName: 'John',
      lastName: 'Smith',
      txType: 'Purchase',
      amountMin: 1001,
      amountMax: 15000,
      txDate: '2026-04-20',
      disclosureDate: '2026-05-12',
    },
    {
      ticker: '',  // no ticker — should be skipped
      chamber: 'senate',
      firstName: 'Skip',
      lastName: 'Me',
      txType: 'Sale',
      amountMin: 0,
      amountMax: 0,
      txDate: '2026-04-01',
      disclosureDate: '',
    },
  ],
};

describe('parseCapitolTradesResponse', () => {
  it('parses well-formed JSON into typed trade items', () => {
    const items = parseCapitolTradesResponse(SAMPLE_RESPONSE);
    expect(items).toHaveLength(2); // 3rd entry has no ticker, should be skipped

    const aapl = items.find(i => i.ticker === 'AAPL');
    expect(aapl).toBeDefined();
    expect(aapl?.chamber).toBe('senate');
    expect(aapl?.member).toBe('Jane Doe');
    expect(aapl?.kind).toBe('Sale');
    expect(aapl?.amountLow).toBe(15001);
    expect(aapl?.amountHigh).toBe(50000);
    expect(aapl?.txnDate).toBe('2026-04-15');
  });

  it('normalises ticker to uppercase', () => {
    const items = parseCapitolTradesResponse(SAMPLE_RESPONSE);
    const msft = items.find(i => i.ticker === 'MSFT');
    expect(msft).toBeDefined();
    expect(msft?.chamber).toBe('house');
  });

  it('returns [] for null / non-object input', () => {
    expect(parseCapitolTradesResponse(null)).toEqual([]);
    expect(parseCapitolTradesResponse('bad')).toEqual([]);
    expect(parseCapitolTradesResponse({ data: 'not an array' })).toEqual([]);
  });
});

describe('CapitolTradesClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns parsed trades on a 200 JSON response', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => SAMPLE_RESPONSE,
    });

    const client = new CapitolTradesClient('https://mock.bff');
    const trades = await client.getRecentTrades(50);
    expect(trades).toHaveLength(2);
    expect(trades[0].ticker).toBe('AAPL');
  });

  it('throws when the server returns a 503 HTML page', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 503,
      headers: { get: () => 'text/html' },
      text: async () => '<html>Service Unavailable</html>',
    });

    const client = new CapitolTradesClient('https://mock.bff');
    await expect(client.getRecentTrades()).rejects.toThrow('CapitolTrades HTTP 503');
  });

  it('throws when JSON response is malformed (content-type ok but response is not application/json)', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'text/html; charset=utf-8' },
      text: async () => '<html>Maintenance</html>',
    });

    const client = new CapitolTradesClient('https://mock.bff');
    await expect(client.getRecentTrades()).rejects.toThrow('CapitolTrades HTTP 200');
  });
});
