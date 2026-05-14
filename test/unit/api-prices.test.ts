import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';
import { ProviderChain } from '@/lib/providers/chain';
import { MockProvider } from '@/lib/providers/mock';
import * as providers from '@/lib/providers';

const TEST_DB_DIR = path.join(process.cwd(), '.vitest-cache', 'api-prices');
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test.db');

function setupDb() {
  closeDb();
  if (existsSync(TEST_DB_DIR)) rmSync(TEST_DB_DIR, { recursive: true, force: true });
  mkdirSync(TEST_DB_DIR, { recursive: true });
  process.env.DB_PATH = TEST_DB_PATH;
  applySchema(getDb());
}

describe('GET /api/prices/[ticker]/latest', () => {
  beforeEach(() => {
    setupDb();
    vi.restoreAllMocks();
    providers.resetChains();
  });

  afterAll(() => {
    vi.restoreAllMocks();
    closeDb();
    rmSync(TEST_DB_DIR, { recursive: true, force: true });
  });

  it('returns 200 with quote when provider returns data', async () => {
    const chain = new ProviderChain([new MockProvider({ basePrices: { AAPL: 175 } })]);
    vi.spyOn(providers, 'quoteChain').mockReturnValue(chain);

    const { GET } = await import('@/app/api/prices/[ticker]/latest/route');
    const res = await GET(
      new Request('http://localhost/api/prices/AAPL/latest'),
      { params: Promise.resolve({ ticker: 'AAPL' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ticker).toBe('AAPL');
    expect(body.price).toBe(175);
  });

  it('returns 404 when provider returns null', async () => {
    const chain = new ProviderChain([new MockProvider({ basePrices: {} })]);
    vi.spyOn(providers, 'quoteChain').mockReturnValue(chain);

    const { GET } = await import('@/app/api/prices/[ticker]/latest/route');
    const res = await GET(
      new Request('http://localhost/api/prices/UNKNOWN/latest'),
      { params: Promise.resolve({ ticker: 'UNKNOWN' }) },
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });
});

describe('GET /api/prices/[ticker]/bars', () => {
  beforeEach(() => {
    setupDb();
    vi.restoreAllMocks();
    providers.resetChains();
  });

  afterAll(() => {
    vi.restoreAllMocks();
    closeDb();
    rmSync(TEST_DB_DIR, { recursive: true, force: true });
  });

  it('returns minute bars with default interval=1m', async () => {
    const chain = new ProviderChain([new MockProvider({ basePrices: { AAPL: 175 } })]);
    vi.spyOn(providers, 'minuteBarsChain').mockReturnValue(chain);

    const { GET } = await import('@/app/api/prices/[ticker]/bars/route');
    const res = await GET(
      new Request('http://localhost/api/prices/AAPL/bars'),
      { params: Promise.resolve({ ticker: 'AAPL' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it('returns daily bars when interval=1d', async () => {
    const chain = new ProviderChain([new MockProvider({ basePrices: { AAPL: 175 } })]);
    vi.spyOn(providers, 'dailyBarsChain').mockReturnValue(chain);

    const { GET } = await import('@/app/api/prices/[ticker]/bars/route');
    const res = await GET(
      new Request('http://localhost/api/prices/AAPL/bars?interval=1d&range=5d'),
      { params: Promise.resolve({ ticker: 'AAPL' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
  });

  it('returns 400 for unsupported interval', async () => {
    const { GET } = await import('@/app/api/prices/[ticker]/bars/route');
    const res = await GET(
      new Request('http://localhost/api/prices/AAPL/bars?interval=5m'),
      { params: Promise.resolve({ ticker: 'AAPL' }) },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('unsupported');
  });

  it('supports prepost=true query param', async () => {
    const mockChain = new ProviderChain([new MockProvider({ basePrices: { AAPL: 175 } })]);
    const spy = vi.spyOn(providers, 'minuteBarsChain').mockReturnValue(mockChain);
    const chainSpy = vi.spyOn(mockChain, 'getMinuteBars');

    const { GET } = await import('@/app/api/prices/[ticker]/bars/route');
    await GET(
      new Request('http://localhost/api/prices/AAPL/bars?interval=1m&prepost=true'),
      { params: Promise.resolve({ ticker: 'AAPL' }) },
    );

    expect(spy).toHaveBeenCalled();
    expect(chainSpy).toHaveBeenCalledWith('AAPL', expect.objectContaining({ prepost: true }));
  });

  it('supports various range values', async () => {
    const chain = new ProviderChain([new MockProvider({ basePrices: { AAPL: 175 } })]);
    vi.spyOn(providers, 'dailyBarsChain').mockReturnValue(chain);

    const { GET } = await import('@/app/api/prices/[ticker]/bars/route');
    for (const range of ['1mo', '3mo', 'ytd', '1y', '5y', 'max']) {
      const res = await GET(
        new Request(`http://localhost/api/prices/AAPL/bars?interval=1d&range=${range}`),
        { params: Promise.resolve({ ticker: 'AAPL' }) },
      );
      expect(res.status).toBe(200);
    }
  });
});
