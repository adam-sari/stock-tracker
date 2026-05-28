import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';
import { backfillCongressTrades } from '@/lib/backfill/congress';
import type { FmpClient } from '@/lib/providers/fmp';
import type { CapitolTradesClient } from '@/lib/providers/capitoltrades';

const TEST_DB_DIR = path.join(process.cwd(), '.vitest-cache', 'backfill-congress');
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test.db');

function resetDb() {
  closeDb();
  if (existsSync(TEST_DB_DIR)) rmSync(TEST_DB_DIR, { recursive: true, force: true });
  mkdirSync(TEST_DB_DIR, { recursive: true });
  process.env.DB_PATH = TEST_DB_PATH;
  applySchema(getDb());
}

function fakeFmp(senate: any[], house: any[]): FmpClient {
  return {
    getSenateLatest: vi.fn().mockResolvedValue(senate),
    getHouseLatest: vi.fn().mockResolvedValue(house),
  } as unknown as FmpClient;
}
function fakeCT(items: any[] = []): CapitolTradesClient {
  return { getRecentTrades: vi.fn().mockResolvedValue(items) } as unknown as CapitolTradesClient;
}

describe('backfillCongressTrades', () => {
  beforeEach(resetDb);
  afterAll(() => { closeDb(); rmSync(TEST_DB_DIR, { recursive: true, force: true }); });

  it('inserts FMP rows into congress_trades', async () => {
    const fmp = fakeFmp(
      [{ ticker: 'AAPL', chamber: 'senate', member: 'X', district: '', kind: 'Purchase',
         amountLow: 1000, amountHigh: 15000, transactionDate: '2024-01-15',
         disclosureDate: '2024-01-30', ptrUrl: 'http://a' }],
      [{ ticker: 'NVDA', chamber: 'house', member: 'Y', district: 'TX-1', kind: 'Sale',
         amountLow: 50000, amountHigh: 100000, transactionDate: '2024-01-20',
         disclosureDate: '2024-02-01', ptrUrl: 'http://b' }],
    );
    const ct = fakeCT();
    const r = await backfillCongressTrades(fmp, ct, { fromDate: '2024-01-01', toDate: '2024-02-01' });
    expect(r.inserted).toBe(2);
    const rows = getDb().prepare(`SELECT ticker, kind FROM congress_trades ORDER BY ticker`).all() as any[];
    expect(rows.map(r => r.ticker)).toEqual(['AAPL', 'NVDA']);
  });

  it('falls back to Capitol Trades when FMP throws', async () => {
    const fmp = {
      getSenateLatest: vi.fn().mockRejectedValue(new Error('quota')),
      getHouseLatest: vi.fn().mockRejectedValue(new Error('quota')),
    } as unknown as FmpClient;
    const ct = fakeCT([
      { ticker: 'SPY', chamber: 'senate', member: 'Z', kind: 'Purchase',
        amountLow: 1000, amountHigh: 15000, txnDate: '2024-01-10', disclosedAt: '2024-01-25' },
    ]);
    const r = await backfillCongressTrades(fmp, ct, { fromDate: '2024-01-01', toDate: '2024-02-01' });
    expect(r.inserted).toBeGreaterThan(0);
    const rows = getDb().prepare(`SELECT ticker FROM congress_trades`).all() as any[];
    expect(rows.find((r: any) => r.ticker === 'SPY')).toBeTruthy();
  });

  it('is idempotent: running twice yields the same row count', async () => {
    const fmp = fakeFmp(
      [{ ticker: 'AAPL', chamber: 'senate', member: 'X', district: '', kind: 'Purchase',
         amountLow: 1, amountHigh: 2, transactionDate: '2024-01-15',
         disclosureDate: '2024-01-30', ptrUrl: 'http://a' }],
      [],
    );
    const ct = fakeCT();
    await backfillCongressTrades(fmp, ct, { fromDate: '2024-01-01', toDate: '2024-02-01' });
    await backfillCongressTrades(fmp, ct, { fromDate: '2024-01-01', toDate: '2024-02-01' });
    const n = (getDb().prepare(`SELECT COUNT(*) AS n FROM congress_trades`).get() as { n: number }).n;
    expect(n).toBe(1);
  });

  it('drops FMP rows missing disclosureDate (no look-ahead fallback to transactionDate)', async () => {
    const fmp = fakeFmp(
      [
        { ticker: 'AAPL', chamber: 'senate', member: 'X', district: '', kind: 'Purchase',
          amountLow: 1000, amountHigh: 15000, transactionDate: '2024-01-15',
          disclosureDate: '2024-01-30', ptrUrl: 'http://a' },
        { ticker: 'MSFT', chamber: 'senate', member: 'Y', district: '', kind: 'Purchase',
          amountLow: 1000, amountHigh: 15000, transactionDate: '2024-01-16',
          disclosureDate: undefined, ptrUrl: 'http://b' },
        { ticker: 'GOOG', chamber: 'senate', member: 'Z', district: '', kind: 'Purchase',
          amountLow: 1000, amountHigh: 15000, transactionDate: '2024-01-17',
          disclosureDate: '', ptrUrl: 'http://c' },
      ],
      [],
    );
    const ct = fakeCT();
    const r = await backfillCongressTrades(fmp, ct, { fromDate: '2024-01-01', toDate: '2024-02-01' });
    expect(r.senate).toBe(1);
    expect(r.warnings.some(w => w.includes('missing_disclosure'))).toBe(true);

    const rows = getDb().prepare(
      `SELECT ticker, disclosed_at FROM congress_trades ORDER BY ticker`
    ).all() as Array<{ ticker: string; disclosed_at: number }>;
    expect(rows.map(r => r.ticker)).toEqual(['AAPL']);
    expect(rows[0].disclosed_at).toBe(
      Math.floor(new Date('2024-01-30').getTime() / 1000),
    );
  });

  it('drops Capitol Trades fallback rows missing disclosedAt (not stored as disclosed_at=0)', async () => {
    const fmp = {
      getSenateLatest: vi.fn().mockRejectedValue(new Error('quota')),
      getHouseLatest: vi.fn().mockRejectedValue(new Error('quota')),
    } as unknown as FmpClient;
    const ct = fakeCT([
      { ticker: 'SPY', chamber: 'senate', member: 'A', kind: 'Purchase',
        amountLow: 1000, amountHigh: 15000, txnDate: '2024-01-10', disclosedAt: '2024-01-25' },
      { ticker: 'QQQ', chamber: 'senate', member: 'B', kind: 'Purchase',
        amountLow: 1000, amountHigh: 15000, txnDate: '2024-01-11', disclosedAt: undefined },
    ]);
    const r = await backfillCongressTrades(fmp, ct, { fromDate: '2024-01-01', toDate: '2024-02-01' });
    const rows = getDb().prepare(`SELECT ticker FROM congress_trades`).all() as Array<{ ticker: string }>;
    expect(rows.find(r => r.ticker === 'SPY')).toBeTruthy();
    expect(rows.find(r => r.ticker === 'QQQ')).toBeUndefined();
    expect(r.warnings.some(w => w.includes('missing_disclosure'))).toBe(true);
  });
});
