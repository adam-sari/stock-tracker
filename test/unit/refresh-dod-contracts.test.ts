import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';
import { createTransaction } from '@/lib/db/queries/transactions';
import { addToWatchlist } from '@/lib/db/queries/watchlist';
import { listDodContracts } from '@/lib/db/queries/dod-contracts';
import { refreshDodContractsOnce } from '@/lib/jobs/refresh-dod-contracts';
import { USASpendingClient } from '@/lib/providers/usaspending';

const TEST_DB_DIR = path.join(process.cwd(), '.vitest-cache', 'refresh-dod-contracts');
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test.db');

function resetDb() {
  closeDb();
  if (existsSync(TEST_DB_DIR)) rmSync(TEST_DB_DIR, { recursive: true, force: true });
  mkdirSync(TEST_DB_DIR, { recursive: true });
  process.env.DB_PATH = TEST_DB_PATH;
  applySchema(getDb());
}

describe('refreshDodContractsOnce', () => {
  beforeEach(() => {
    resetDb();
    vi.restoreAllMocks();
  });

  afterAll(() => {
    closeDb();
    if (existsSync(TEST_DB_DIR)) rmSync(TEST_DB_DIR, { recursive: true, force: true });
  });

  it('stores contracts for held defense tickers', async () => {
    // Hold LMT (a defense name in our map)
    createTransaction({ ticker: 'LMT', kind: 'buy', qty: 2, price: 450, executed_at: '2026-01-01T14:30:00Z' });

    const client = new USASpendingClient();
    vi.spyOn(client, 'searchAwards').mockResolvedValue([
      {
        awardId: 'AWARD-001',
        recipientName: 'Lockheed Martin Corp',
        description: 'F-35 fighter jet components',
        awardAmount: 250_000_000,
        actionDate: '2026-05-01',
        awardingAgency: 'Department of Defense',
      },
    ]);

    const result = await refreshDodContractsOnce(client);
    expect(result.tickers).toBe(1);
    expect(result.stored).toBe(1);

    const contracts = listDodContracts({ ticker: 'LMT' });
    expect(contracts).toHaveLength(1);
    expect(contracts[0].ticker).toBe('LMT');
    expect(contracts[0].recipient_name).toBe('Lockheed Martin Corp');
    expect(contracts[0].award_amount).toBe(250_000_000);
  });

  it('stores contracts for watched defense tickers', async () => {
    addToWatchlist('RTX');

    const client = new USASpendingClient();
    vi.spyOn(client, 'searchAwards').mockResolvedValue([
      {
        awardId: 'AWARD-002',
        recipientName: 'Raytheon Technologies',
        description: 'Missile guidance systems',
        awardAmount: 50_000_000,
        actionDate: '2026-04-20',
        awardingAgency: 'Department of Defense',
      },
    ]);

    const result = await refreshDodContractsOnce(client);
    expect(result.stored).toBe(1);

    const contracts = listDodContracts({ ticker: 'RTX' });
    expect(contracts).toHaveLength(1);
    expect(contracts[0].description).toBe('Missile guidance systems');
  });

  it('skips non-defense tickers', async () => {
    // Hold AAPL — not a defense name
    createTransaction({ ticker: 'AAPL', kind: 'buy', qty: 10, price: 170, executed_at: '2026-01-01T14:30:00Z' });

    const client = new USASpendingClient();
    const spy = vi.spyOn(client, 'searchAwards').mockResolvedValue([]);

    const result = await refreshDodContractsOnce(client);
    // AAPL is not in KNOWN_DEFENSE_RECIPIENTS → no calls, no stored rows
    expect(spy).not.toHaveBeenCalled();
    expect(result.tickers).toBe(0);
    expect(result.stored).toBe(0);
  });

  it('is idempotent — upserts overwrite existing rows', async () => {
    createTransaction({ ticker: 'LMT', kind: 'buy', qty: 2, price: 450, executed_at: '2026-01-01T14:30:00Z' });

    const client = new USASpendingClient();
    vi.spyOn(client, 'searchAwards').mockResolvedValue([
      {
        awardId: 'AWARD-001',
        recipientName: 'Lockheed Martin Corp',
        description: 'F-35 components',
        awardAmount: 250_000_000,
        actionDate: '2026-05-01',
        awardingAgency: 'Department of Defense',
      },
    ]);

    await refreshDodContractsOnce(client);
    await refreshDodContractsOnce(client);

    const contracts = listDodContracts({ ticker: 'LMT' });
    expect(contracts).toHaveLength(1);
  });

  it('handles API errors gracefully without crashing', async () => {
    createTransaction({ ticker: 'LMT', kind: 'buy', qty: 2, price: 450, executed_at: '2026-01-01T14:30:00Z' });

    const client = new USASpendingClient();
    vi.spyOn(client, 'searchAwards').mockRejectedValue(new Error('HTTP 503'));

    // Should not throw
    const result = await refreshDodContractsOnce(client);
    expect(result.stored).toBe(0);
  });
});
