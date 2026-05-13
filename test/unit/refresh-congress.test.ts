import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';
import { listCongressForTicker } from '@/lib/db/queries/congress';
import { refreshCongressOnce } from '@/lib/jobs/refresh-congress';
import { FmpClient } from '@/lib/providers/fmp';

const TEST_DB_DIR = path.join(process.cwd(), '.vitest-cache', 'refresh-congress');
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test.db');

describe('refreshCongressOnce', () => {
  beforeEach(() => {
    closeDb();
    if (existsSync(TEST_DB_DIR)) rmSync(TEST_DB_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DB_DIR, { recursive: true });
    process.env.DB_PATH = TEST_DB_PATH;
    applySchema(getDb());
  });
  afterAll(() => { closeDb(); rmSync(TEST_DB_DIR, { recursive: true, force: true }); });

  it('mirrors senate + house feeds into one table', async () => {
    const fmp = new FmpClient({ apiKey: 'k' });
    vi.spyOn(fmp, 'getSenateLatest').mockResolvedValue([
      { ticker: 'AAPL', chamber: 'senate', member: 'Jane Doe', district: 'CA', kind: 'Sale', amountLow: 15001, amountHigh: 50000, transactionDate: '2026-04-15', disclosureDate: '2026-05-10', ptrUrl: 'https://efds/jane/aapl' },
    ]);
    vi.spyOn(fmp, 'getHouseLatest').mockResolvedValue([
      { ticker: 'AESI', chamber: 'house', member: 'Chip Roy', district: 'TX21', kind: 'Purchase', amountLow: 100001, amountHigh: 250000, transactionDate: '2026-03-30', disclosureDate: '2026-05-12', ptrUrl: 'https://house/roy/aesi.pdf' },
    ]);

    await refreshCongressOnce(fmp);

    const aapl = listCongressForTicker('AAPL');
    expect(aapl.length).toBe(1);
    expect(aapl[0].chamber).toBe('senate');
    expect(aapl[0].amount_high).toBe(50000);

    const aesi = listCongressForTicker('AESI');
    expect(aesi[0].chamber).toBe('house');
  });

  it('idempotent on repeat', async () => {
    const fmp = new FmpClient({ apiKey: 'k' });
    vi.spyOn(fmp, 'getSenateLatest').mockResolvedValue([
      { ticker: 'AAPL', chamber: 'senate', member: 'X', district: 'CA', kind: 'Sale', amountLow: 1, amountHigh: 1, transactionDate: '2026-04-15', disclosureDate: '2026-05-10', ptrUrl: 'https://x' },
    ]);
    vi.spyOn(fmp, 'getHouseLatest').mockResolvedValue([]);
    await refreshCongressOnce(fmp);
    await refreshCongressOnce(fmp);
    expect(listCongressForTicker('AAPL').length).toBe(1);
  });
});
