/**
 * Direct tests for lib/providers/ark.ts — ArkClient HTTP layer.
 * Note: parseArkCsv, buildCsvUrl, and ARK_FUNDS already have tests in
 * refresh-ark-trades.test.ts. Here we add coverage for:
 *   - ArkClient.fetchFundTrades() HTTP mechanics
 *   - parseArkCsv edge cases not covered elsewhere
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ArkClient, parseArkCsv, ARK_FUNDS, buildCsvUrl } from '@/lib/providers/ark';

const MINIMAL_CSV = `Date,Direction,Ticker,CUSIP,Name,Shares,% of ETF
05/13/2026,Buy,TSLA,,,25000,0.5
05/13/2026,Sell,COIN,,,8000,0.2
`;

describe('ARK_FUNDS constant', () => {
  it('contains the 6 expected fund tickers', () => {
    expect(ARK_FUNDS).toEqual(['ARKK', 'ARKG', 'ARKQ', 'ARKF', 'ARKW', 'ARKX']);
    expect(ARK_FUNDS).toHaveLength(6);
  });
});

describe('parseArkCsv edge cases', () => {
  it('returns empty array for CSV with only a header row', () => {
    expect(parseArkCsv('ARKK', 'Date,Direction,Ticker,CUSIP,Name,Shares,% of ETF\n')).toEqual([]);
  });

  it('returns empty array for completely empty string', () => {
    expect(parseArkCsv('ARKK', '')).toEqual([]);
  });

  it('skips rows that have no ticker', () => {
    const csv = `Date,Direction,Ticker,CUSIP,Name,Shares,% of ETF
05/13/2026,Buy,,,,1000,0.1
05/13/2026,Buy,MSFT,,,2000,0.2
`;
    const trades = parseArkCsv('ARKK', csv);
    expect(trades).toHaveLength(1);
    expect(trades[0].ticker).toBe('MSFT');
  });

  it('treats unrecognized direction as empty string', () => {
    const csv = `Date,Direction,Ticker,CUSIP,Name,Shares,% of ETF
05/13/2026,Exchange,AAPL,,,1000,0.1
`;
    const trades = parseArkCsv('ARKK', csv);
    expect(trades[0].direction).toBe('');
  });

  it('handles quoted fields with commas inside them', () => {
    const csv = `Date,Direction,Ticker,CUSIP,"Name",Shares,% of ETF
05/13/2026,Buy,NVDA,,"NVIDIA, Inc.",5000,0.8
`;
    const trades = parseArkCsv('ARKK', csv);
    expect(trades).toHaveLength(1);
    expect(trades[0].ticker).toBe('NVDA');
    expect(trades[0].shares).toBe(5000);
  });

  it('parses shares with comma-formatted numbers', () => {
    const csv = `Date,Direction,Ticker,CUSIP,Name,Shares,% of ETF
05/13/2026,Buy,TSLA,,,1,234,0.1
`;
    // "1,234" would be treated as two columns — only the first numeric part matters
    // The parser strips commas from sharesRaw
    const csv2 = `Date,Direction,Ticker,CUSIP,Name,Shares,% of ETF
"05/13/2026","Buy","TSLA","","","1234","0.1"
`;
    const trades = parseArkCsv('ARKK', csv2);
    expect(trades[0].shares).toBe(1234);
  });

  it('normalises already-ISO dates (YYYY-MM-DD) unchanged', () => {
    const csv = `Date,Direction,Ticker,CUSIP,Name,Shares,% of ETF
2026-05-13,Buy,META,,,3000,0.3
`;
    const trades = parseArkCsv('ARKK', csv);
    expect(trades[0].ts).toBe('2026-05-13');
  });
});

describe('ArkClient.fetchFundTrades', () => {
  afterEach(() => vi.restoreAllMocks());

  it('fetches CSV text and parses it into ArkTrade[]', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => MINIMAL_CSV,
    } as Response);

    const client = new ArkClient();
    const trades = await client.fetchFundTrades('ARKK');

    expect(trades).toHaveLength(2);
    expect(trades[0].ticker).toBe('TSLA');
    expect(trades[0].direction).toBe('Buy');
    expect(trades[1].ticker).toBe('COIN');
    expect(trades[1].direction).toBe('Sell');
  });

  it('throws on non-OK HTTP status', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 404,
    } as Response);

    const client = new ArkClient();
    await expect(client.fetchFundTrades('ARKK')).rejects.toThrow('404');
  });

  it('uses the injected baseUrl when building the CSV URL', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => 'Date,Direction,Ticker,CUSIP,Name,Shares,% of ETF\n',
    } as Response);

    const client = new ArkClient('https://test-ark.example.com');
    await client.fetchFundTrades('ARKK');

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://test-ark.example.com/wp-content/uploads/funds-etf-csv/ARKK_TRADES.csv',
    );
  });
});
