import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';
import { createTransaction } from '@/lib/db/queries/transactions';
import { listCorporateActions } from '@/lib/db/queries/corporate-actions';
import { refreshCorporateActionsOnce } from '@/lib/jobs/refresh-corporate-actions';
import { FmpClient } from '@/lib/providers/fmp';

const TEST_DB_DIR = path.join(process.cwd(), '.vitest-cache', 'refresh-corp');
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test.db');

describe('refreshCorporateActionsOnce', () => {
  beforeEach(() => {
    closeDb();
    if (existsSync(TEST_DB_DIR)) rmSync(TEST_DB_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DB_DIR, { recursive: true });
    process.env.DB_PATH = TEST_DB_PATH;
    applySchema(getDb());
  });
  afterAll(() => { closeDb(); rmSync(TEST_DB_DIR, { recursive: true, force: true }); });

  it('stores dividends from FMP for held tickers', async () => {
    createTransaction({ ticker: 'AAPL', kind: 'buy', qty: 10, price: 150, executed_at: '2026-01-01T14:30:00Z' });
    const fmp = new FmpClient({ apiKey: 'k' });
    vi.spyOn(fmp, 'getDividends').mockResolvedValue([
      { symbol: 'AAPL', exDate: '2026-05-11', recordDate: '2026-05-11', paymentDate: '2026-05-14', declarationDate: '2026-04-30', dividend: 0.27, yield: 0.36, frequency: 'Quarterly' },
    ]);
    await refreshCorporateActionsOnce(fmp);
    const acts = listCorporateActions('AAPL');
    expect(acts.length).toBe(1);
    expect(acts[0].kind).toBe('dividend');
    expect(acts[0].amount).toBe(0.27);
    expect(acts[0].payment_date).toBe('2026-05-14');
  });
});
