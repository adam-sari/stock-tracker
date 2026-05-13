import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';
import { listCabinetTrades, listCabinetTradesForTicker } from '@/lib/db/queries/cabinet-trades';
import { refreshCabinetTradesOnce } from '@/lib/jobs/refresh-cabinet-trades';
import { OpenCabinetClient, parseFullDataset, parseAmountBracket } from '@/lib/providers/open-cabinet';

const TEST_DB_DIR = path.join(process.cwd(), '.vitest-cache', 'refresh-cabinet-trades');
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test.db');

const FIXTURE_JSON = JSON.parse(
  readFileSync(
    path.join(process.cwd(), 'test/fixtures/open-cabinet-full-dataset.json'),
    'utf-8',
  ),
);

function resetDb() {
  closeDb();
  if (existsSync(TEST_DB_DIR)) rmSync(TEST_DB_DIR, { recursive: true, force: true });
  mkdirSync(TEST_DB_DIR, { recursive: true });
  process.env.DB_PATH = TEST_DB_PATH;
  applySchema(getDb());
}

describe('parseAmountBracket', () => {
  it('parses known brackets into [low, high] tuples', () => {
    expect(parseAmountBracket('$1,001-$15,000')).toEqual([1001, 15000]);
    expect(parseAmountBracket('$15,001-$50,000')).toEqual([15001, 50000]);
    expect(parseAmountBracket('$500,001-$1,000,000')).toEqual([500001, 1000000]);
    expect(parseAmountBracket('$5,000,001-$25,000,000')).toEqual([5000001, 25000000]);
  });

  it('returns [null, null] for unrecognized brackets', () => {
    expect(parseAmountBracket('')).toEqual([null, null]);
    expect(parseAmountBracket('Unknown')).toEqual([null, null]);
  });

  it('returns null for the high end of "Over $50,000,000"', () => {
    const [low, high] = parseAmountBracket('Over $50,000,000');
    expect(low).toBe(50000001);
    expect(high).toBeNull();
  });
});

describe('parseFullDataset', () => {
  it('flattens officials and transactions, skipping blank tickers', () => {
    const txns = parseFullDataset(FIXTURE_JSON);
    // 5 raw transactions: 4 with tickers + 1 blank-ticker row (skipped) = 4 kept
    // Wait: fixture has MDT, REGN, AMZN, IJLXX (ticker present), blank (skipped) + VTI = 5 kept
    expect(txns.length).toBe(5);
  });

  it('correctly maps fields from official + transaction', () => {
    const txns = parseFullDataset(FIXTURE_JSON);
    const mdt = txns.find(t => t.ticker === 'MDT');
    expect(mdt).toBeDefined();
    expect(mdt!.officialName).toBe('Bedford, Bryan');
    expect(mdt!.title).toBe('FAA Administrator');
    expect(mdt!.agency).toBe('Department of Transportation');
    expect(mdt!.kind).toBe('Purchase');
    expect(mdt!.date).toBe('2025-07-11');
    expect(mdt!.amountLow).toBe(15001);
    expect(mdt!.amountHigh).toBe(50000);
    expect(mdt!.lateFilingFlag).toBe(false);
  });

  it('uppercases ticker symbols', () => {
    const txns = parseFullDataset(FIXTURE_JSON);
    for (const t of txns) {
      expect(t.ticker).toBe(t.ticker.toUpperCase());
    }
  });

  it('skips transactions with empty or missing ticker', () => {
    const txns = parseFullDataset(FIXTURE_JSON);
    // The blank-ticker row ("Fund with no ticker") should not appear
    expect(txns.every(t => t.ticker.length > 0)).toBe(true);
  });
});

describe('refreshCabinetTradesOnce', () => {
  beforeEach(() => {
    resetDb();
    vi.restoreAllMocks();
  });

  afterAll(() => {
    closeDb();
    if (existsSync(TEST_DB_DIR)) rmSync(TEST_DB_DIR, { recursive: true, force: true });
  });

  it('stores transactions from the fixture dataset', async () => {
    const client = new OpenCabinetClient();
    vi.spyOn(client, 'fetchTransactions').mockResolvedValue(
      parseFullDataset(FIXTURE_JSON),
    );

    const result = await refreshCabinetTradesOnce(client);
    expect(result.stored).toBe(5);

    const all = listCabinetTrades();
    expect(all.length).toBe(5);
  });

  it('is idempotent — repeated runs do not duplicate rows', async () => {
    const client = new OpenCabinetClient();
    vi.spyOn(client, 'fetchTransactions').mockResolvedValue(
      parseFullDataset(FIXTURE_JSON),
    );

    await refreshCabinetTradesOnce(client);
    await refreshCabinetTradesOnce(client);

    expect(listCabinetTrades().length).toBe(5);
  });

  it('can filter trades by ticker', async () => {
    const client = new OpenCabinetClient();
    vi.spyOn(client, 'fetchTransactions').mockResolvedValue(
      parseFullDataset(FIXTURE_JSON),
    );

    await refreshCabinetTradesOnce(client);

    const mdtTrades = listCabinetTradesForTicker('MDT');
    expect(mdtTrades.length).toBe(1);
    expect(mdtTrades[0].official_name).toBe('Bedford, Bryan');
    expect(mdtTrades[0].kind).toBe('Purchase');
    expect(mdtTrades[0].amount_low).toBe(15001);
    expect(mdtTrades[0].amount_high).toBe(50000);
  });

  it('records a job_runs entry on success', async () => {
    const client = new OpenCabinetClient();
    vi.spyOn(client, 'fetchTransactions').mockResolvedValue(
      parseFullDataset(FIXTURE_JSON),
    );

    await refreshCabinetTradesOnce(client);

    const db = getDb();
    const run = db
      .prepare(`SELECT * FROM job_runs WHERE job = 'refresh_cabinet_trades' ORDER BY id DESC LIMIT 1`)
      .get() as { status: string; detail: string } | undefined;
    expect(run?.status).toBe('ok');
    expect(run?.detail).toContain('stored=5');
  });

  it('records an error in job_runs when fetch fails', async () => {
    const client = new OpenCabinetClient();
    vi.spyOn(client, 'fetchTransactions').mockRejectedValue(new Error('HTTP 503'));

    const result = await refreshCabinetTradesOnce(client);
    expect(result.stored).toBe(0);

    const db = getDb();
    const run = db
      .prepare(`SELECT * FROM job_runs WHERE job = 'refresh_cabinet_trades' ORDER BY id DESC LIMIT 1`)
      .get() as { status: string; detail: string } | undefined;
    expect(run?.status).toBe('error');
  });
});
