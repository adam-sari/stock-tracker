import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';
import { ProviderChain } from '@/lib/providers/chain';
import { MockProvider } from '@/lib/providers/mock';
import { getProviderHealth } from '@/lib/db/queries/health';
import type { MarketDataProvider, Quote, Bar, ProviderHealth } from '@/lib/providers/types';

const TEST_DB_DIR = path.join(process.cwd(), '.vitest-cache', 'chain-test');
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test.db');

class FailingProvider implements MarketDataProvider {
  readonly name = 'failing';
  async health(): Promise<ProviderHealth> { return { status: 'down' }; }
  async getLatestQuote(): Promise<Quote | null> { throw new Error('boom'); }
  async getMinuteBars(): Promise<Bar[]> { throw new Error('boom'); }
  async getDailyBars(): Promise<Bar[]> { throw new Error('boom'); }
}

describe('ProviderChain', () => {
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

  it('returns the first provider that yields data', async () => {
    const chain = new ProviderChain([
      new MockProvider({ basePrices: {} }),
      new MockProvider({ basePrices: { AAPL: 200 } }),
    ]);
    const q = await chain.getLatestQuote('AAPL');
    expect(q!.price).toBe(200);
  });

  it('falls through when a provider throws', async () => {
    const chain = new ProviderChain([
      new FailingProvider(),
      new MockProvider({ basePrices: { AAPL: 150 } }),
    ]);
    const q = await chain.getLatestQuote('AAPL');
    expect(q!.price).toBe(150);

    const health = getProviderHealth();
    const failing = health.find(h => h.provider === 'failing')!;
    expect(failing.consecutive_failures).toBe(1);
    expect(failing.last_error_msg).toContain('boom');
  });

  it('returns null when all providers fail', async () => {
    const chain = new ProviderChain([new FailingProvider(), new FailingProvider()]);
    const q = await chain.getLatestQuote('AAPL');
    expect(q).toBeNull();
  });

  it('records success on a recovered provider', async () => {
    const chain = new ProviderChain([new MockProvider({ basePrices: { AAPL: 100 } })]);
    await chain.getLatestQuote('AAPL');
    const health = getProviderHealth();
    const mock = health.find(h => h.provider === 'mock')!;
    expect(mock.status).toBe('ok');
    expect(mock.consecutive_failures).toBe(0);
  });
});
