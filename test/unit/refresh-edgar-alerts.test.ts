import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';
import { createTransaction } from '@/lib/db/queries/transactions';
import { addToWatchlist } from '@/lib/db/queries/watchlist';
import { listEdgarAlerts } from '@/lib/db/queries/edgar-alerts';
import { refreshEdgarAlertsOnce } from '@/lib/jobs/refresh-edgar-alerts';
import * as secEdgar from '@/lib/providers/sec-edgar';

const TEST_DB_DIR = path.join(process.cwd(), '.vitest-cache', 'refresh-edgar-alerts');
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test.db');

function resetDb() {
  closeDb();
  if (existsSync(TEST_DB_DIR)) rmSync(TEST_DB_DIR, { recursive: true, force: true });
  mkdirSync(TEST_DB_DIR, { recursive: true });
  process.env.DB_PATH = TEST_DB_PATH;
  applySchema(getDb());
}

describe('refreshEdgarAlertsOnce', () => {
  beforeEach(() => {
    resetDb();
    vi.restoreAllMocks();
  });

  afterAll(() => {
    closeDb();
    if (existsSync(TEST_DB_DIR)) rmSync(TEST_DB_DIR, { recursive: true, force: true });
  });

  it('stores alerts for held tickers matching EDGAR hits', async () => {
    // Setup: hold AAPL
    createTransaction({ ticker: 'AAPL', kind: 'buy', qty: 10, price: 150, executed_at: '2026-01-01T14:30:00Z' });

    // Mock CIK map: AAPL = 0000320193
    vi.spyOn(secEdgar, 'loadCikTickerMap').mockResolvedValue(
      new Map([['0000320193', 'AAPL']]),
    );

    // Mock full-text search to return one hit for "going concern"
    vi.spyOn(secEdgar, 'searchFullText').mockImplementation(async (phrase) => {
      if (phrase === 'going concern') {
        return [{
          entity_name: 'Apple Inc.',
          cik: '0000320193',
          accession_no: '0000320193-26-000001',
          file_date: '2026-04-15',
          snippet: 'There is substantial doubt about the company&#8217;s ability to continue as a going concern.',
        }];
      }
      return [];
    });

    const result = await refreshEdgarAlertsOnce();
    expect(result.phrases).toBe(3);
    expect(result.hits).toBe(1); // only "going concern" returned a hit
    expect(result.stored).toBe(1);

    const alerts = listEdgarAlerts({ ticker: 'AAPL' });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].ticker).toBe('AAPL');
    expect(alerts[0].phrase).toBe('going concern');
    expect(alerts[0].filing_date).toBe('2026-04-15');
    expect(alerts[0].snippet).toContain('going concern');
  });

  it('stores alerts for watched tickers', async () => {
    addToWatchlist('MSFT');

    vi.spyOn(secEdgar, 'loadCikTickerMap').mockResolvedValue(
      new Map([['0000789019', 'MSFT']]),
    );

    vi.spyOn(secEdgar, 'searchFullText').mockImplementation(async (phrase) => {
      if (phrase === 'restatement') {
        return [{
          entity_name: 'Microsoft Corporation',
          cik: '0000789019',
          accession_no: '0000789019-26-000005',
          file_date: '2026-03-10',
          snippet: 'The company has determined that a restatement of prior period financials is required.',
        }];
      }
      return [];
    });

    const result = await refreshEdgarAlertsOnce();
    expect(result.stored).toBe(1);

    const alerts = listEdgarAlerts({ ticker: 'MSFT' });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].phrase).toBe('restatement');
  });

  it('filters out hits for tickers not in held/watched universe', async () => {
    createTransaction({ ticker: 'AAPL', kind: 'buy', qty: 10, price: 150, executed_at: '2026-01-01T14:30:00Z' });

    vi.spyOn(secEdgar, 'loadCikTickerMap').mockResolvedValue(
      new Map([
        ['0000320193', 'AAPL'],
        ['0001018724', 'AMZN'], // Not in portfolio
      ]),
    );

    vi.spyOn(secEdgar, 'searchFullText').mockImplementation(async () => [
      {
        entity_name: 'Amazon.com, Inc.',
        cik: '0001018724',
        accession_no: '0001018724-26-000009',
        file_date: '2026-04-01',
        snippet: 'material adverse change in the business.',
      },
    ]);

    const result = await refreshEdgarAlertsOnce();
    // AMZN hit found but not in universe
    expect(result.hits).toBe(3); // all 3 phrases returned the same hit
    expect(result.stored).toBe(0); // none stored — AMZN not held/watched

    const alerts = listEdgarAlerts();
    expect(alerts).toHaveLength(0);
  });

  it('is idempotent — upserts overwrite existing rows', async () => {
    createTransaction({ ticker: 'AAPL', kind: 'buy', qty: 10, price: 150, executed_at: '2026-01-01T14:30:00Z' });

    vi.spyOn(secEdgar, 'loadCikTickerMap').mockResolvedValue(
      new Map([['0000320193', 'AAPL']]),
    );

    const mockHit = {
      entity_name: 'Apple Inc.',
      cik: '0000320193',
      accession_no: '0000320193-26-000001',
      file_date: '2026-04-15',
      snippet: 'going concern doubt mentioned here.',
    };

    vi.spyOn(secEdgar, 'searchFullText').mockImplementation(async (phrase) => {
      if (phrase === 'going concern') return [mockHit];
      return [];
    });

    // Run twice
    await refreshEdgarAlertsOnce();
    await refreshEdgarAlertsOnce();

    const alerts = listEdgarAlerts({ ticker: 'AAPL' });
    // Should still be 1 due to ON CONFLICT DO UPDATE
    expect(alerts).toHaveLength(1);
  });

  it('returns zero when portfolio is empty', async () => {
    vi.spyOn(secEdgar, 'loadCikTickerMap').mockResolvedValue(new Map());
    vi.spyOn(secEdgar, 'searchFullText').mockResolvedValue([]);

    const result = await refreshEdgarAlertsOnce();
    expect(result.hits).toBe(0);
    expect(result.stored).toBe(0);
  });

  it('handles EDGAR API error gracefully and continues', async () => {
    createTransaction({ ticker: 'AAPL', kind: 'buy', qty: 10, price: 150, executed_at: '2026-01-01T14:30:00Z' });

    vi.spyOn(secEdgar, 'loadCikTickerMap').mockResolvedValue(
      new Map([['0000320193', 'AAPL']]),
    );

    // Simulate API errors for all phrases
    vi.spyOn(secEdgar, 'searchFullText').mockRejectedValue(new Error('HTTP 503'));

    // Should not throw
    const result = await refreshEdgarAlertsOnce();
    expect(result.stored).toBe(0);
  });
});
