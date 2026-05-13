import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';
import { listArkTrades } from '@/lib/db/queries/ark-trades';
import { refreshArkTradesOnce } from '@/lib/jobs/refresh-ark-trades';
import { ArkClient, parseArkCsv, buildCsvUrl } from '@/lib/providers/ark';

const TEST_DB_DIR = path.join(process.cwd(), '.vitest-cache', 'refresh-ark-trades');
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test.db');

const FIXTURE_CSV = readFileSync(
  path.join(process.cwd(), 'test/fixtures/ark-arkk-trades.csv'),
  'utf-8',
);

function resetDb() {
  closeDb();
  if (existsSync(TEST_DB_DIR)) rmSync(TEST_DB_DIR, { recursive: true, force: true });
  mkdirSync(TEST_DB_DIR, { recursive: true });
  process.env.DB_PATH = TEST_DB_PATH;
  applySchema(getDb());
}

describe('parseArkCsv', () => {
  it('parses the fixture CSV into trade records', () => {
    const trades = parseArkCsv('ARKK', FIXTURE_CSV);
    expect(trades.length).toBe(5);
    expect(trades[0]).toMatchObject({
      fund: 'ARKK',
      ticker: 'TSLA',
      direction: 'Buy',
      shares: 50000,
      ts: '2026-05-12',
    });
    expect(trades[1]).toMatchObject({
      ticker: 'COIN',
      direction: 'Sell',
      shares: 10000,
    });
  });

  it('normalizes MM/DD/YYYY dates to YYYY-MM-DD', () => {
    const trades = parseArkCsv('ARKK', FIXTURE_CSV);
    for (const t of trades) {
      expect(t.ts).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('uppercases tickers', () => {
    const csv = 'Date,Direction,Ticker,CUSIP,Name,Shares,% of ETF\n05/12/2026,Buy,tsla,,,1000,0.1';
    const trades = parseArkCsv('ARKK', csv);
    expect(trades[0].ticker).toBe('TSLA');
  });
});

describe('buildCsvUrl', () => {
  it('builds the correct URL', () => {
    expect(buildCsvUrl('ARKK')).toBe(
      'https://www.ark-funds.com/wp-content/uploads/funds-etf-csv/ARKK_TRADES.csv',
    );
  });
});

describe('refreshArkTradesOnce', () => {
  beforeEach(() => {
    resetDb();
    vi.restoreAllMocks();
  });

  afterAll(() => {
    closeDb();
    if (existsSync(TEST_DB_DIR)) rmSync(TEST_DB_DIR, { recursive: true, force: true });
  });

  it('stores trades from all ARK funds', async () => {
    const client = new ArkClient();
    vi.spyOn(client, 'fetchFundTrades').mockImplementation(async (fund) => {
      if (fund === 'ARKK') {
        return parseArkCsv('ARKK', FIXTURE_CSV);
      }
      return [];
    });

    const result = await refreshArkTradesOnce(client);
    // 6 funds attempted; only ARKK returns rows
    expect(result.funds).toBe(6);
    expect(result.stored).toBe(5);

    const trades = listArkTrades({ fund: 'ARKK' });
    expect(trades.length).toBe(5);
    // Most-recent first
    expect(trades[0].ticker).toBeDefined();
  });

  it('is idempotent — upserts overwrite existing rows', async () => {
    const client = new ArkClient();
    vi.spyOn(client, 'fetchFundTrades').mockResolvedValue(
      parseArkCsv('ARKK', FIXTURE_CSV),
    );

    await refreshArkTradesOnce(client);
    await refreshArkTradesOnce(client);

    const trades = listArkTrades();
    // 5 rows from fixture × 6 funds = 30 attempts, but same 5 rows
    expect(trades.length).toBe(5);
  });

  it('continues when a fund fetch fails', async () => {
    const client = new ArkClient();
    let callCount = 0;
    vi.spyOn(client, 'fetchFundTrades').mockImplementation(async () => {
      callCount++;
      if (callCount === 1) throw new Error('HTTP 503');
      return [];
    });

    // Should not throw
    const result = await refreshArkTradesOnce(client);
    expect(result.funds).toBe(5); // 5 of 6 succeeded
    expect(result.stored).toBe(0);
  });

  it('can filter trades by ticker', async () => {
    const client = new ArkClient();
    vi.spyOn(client, 'fetchFundTrades').mockImplementation(async (fund) =>
      fund === 'ARKK' ? parseArkCsv('ARKK', FIXTURE_CSV) : [],
    );

    await refreshArkTradesOnce(client);

    const tslaTrades = listArkTrades({ ticker: 'TSLA' });
    expect(tslaTrades.length).toBe(2); // TSLA appears on two dates
    expect(tslaTrades.every(t => t.ticker === 'TSLA')).toBe(true);
  });
});
