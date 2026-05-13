import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';
import { createTransaction } from '@/lib/db/queries/transactions';
import { pollQuotesOnce } from '@/lib/jobs/poll-quotes';
import { MockProvider } from '@/lib/providers/mock';
import { ProviderChain } from '@/lib/providers/chain';

const TEST_DB_DIR = path.join(process.cwd(), '.vitest-cache', 'pq');
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test.db');

describe('pollQuotesOnce', () => {
  beforeEach(() => {
    closeDb();
    if (existsSync(TEST_DB_DIR)) rmSync(TEST_DB_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DB_DIR, { recursive: true });
    process.env.DB_PATH = TEST_DB_PATH;
    applySchema(getDb());
  });

  afterAll(() => {
    closeDb();
    rmSync(TEST_DB_DIR, { recursive: true, force: true });
  });

  it('writes a quote_latest row for each held ticker', async () => {
    createTransaction({ ticker: 'AAPL', kind: 'buy', qty: 10, price: 150, executed_at: '2026-01-01T14:30:00Z' });
    createTransaction({ ticker: 'NVDA', kind: 'buy', qty: 5, price: 400, executed_at: '2026-01-01T14:30:00Z' });

    const chain = new ProviderChain([new MockProvider({ basePrices: { AAPL: 200, NVDA: 500 } })]);
    const summary = await pollQuotesOnce(chain);
    expect(summary.updated).toBe(2);

    const rows = getDb().prepare(`SELECT * FROM quotes_latest ORDER BY ticker`).all() as Array<{ ticker: string; price: number }>;
    expect(rows.map(r => r.ticker)).toEqual(['AAPL', 'NVDA']);
    expect(rows[0].price).toBe(200);
  });

  it('records job_runs entry with status ok', async () => {
    createTransaction({ ticker: 'AAPL', kind: 'buy', qty: 10, price: 150, executed_at: '2026-01-01T14:30:00Z' });
    const chain = new ProviderChain([new MockProvider({ basePrices: { AAPL: 200 } })]);
    await pollQuotesOnce(chain);
    const job = getDb().prepare(`SELECT * FROM job_runs WHERE job = 'poll_quotes' ORDER BY id DESC LIMIT 1`).get() as { status: string };
    expect(job.status).toBe('ok');
  });

  it('handles 0 holdings cleanly', async () => {
    const chain = new ProviderChain([new MockProvider({ basePrices: {} })]);
    const summary = await pollQuotesOnce(chain);
    expect(summary.updated).toBe(0);
  });
});
