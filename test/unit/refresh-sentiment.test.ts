import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';
import { createTransaction } from '@/lib/db/queries/transactions';
import { latestSentimentForTicker } from '@/lib/db/queries/sentiment';
import { refreshSentimentOnce } from '@/lib/jobs/refresh-sentiment';
import { ApewisdomClient } from '@/lib/providers/apewisdom';

const TEST_DB_DIR = path.join(process.cwd(), '.vitest-cache', 'refresh-sentiment');
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test.db');

describe('refreshSentimentOnce', () => {
  beforeEach(() => {
    closeDb();
    if (existsSync(TEST_DB_DIR)) rmSync(TEST_DB_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DB_DIR, { recursive: true });
    process.env.DB_PATH = TEST_DB_PATH;
    applySchema(getDb());
  });
  afterAll(() => { closeDb(); rmSync(TEST_DB_DIR, { recursive: true, force: true }); });

  it('captures Apewisdom rankings filtered to our universe', async () => {
    createTransaction({ ticker: 'AAPL', kind: 'buy', qty: 10, price: 150, executed_at: '2026-01-01T14:30:00Z' });
    const ape = new ApewisdomClient();
    vi.spyOn(ape, 'getTopStocks').mockResolvedValue([
      { ticker: 'MU', name: 'Micron', rank: 1, mentions: 1445, upvotes: 10065, rank24hAgo: 1, mentions24hAgo: 1248 },
      { ticker: 'AAPL', name: 'Apple', rank: 3, mentions: 120, upvotes: 420, rank24hAgo: 5, mentions24hAgo: 80 },
    ]);
    await refreshSentimentOnce(ape);

    const aapl = latestSentimentForTicker('AAPL');
    expect(aapl!.mentions).toBe(120);
    expect(aapl!.rank).toBe(3);
    // MU not in our universe → not stored
    const mu = latestSentimentForTicker('MU');
    expect(mu).toBeNull();
  });
});
