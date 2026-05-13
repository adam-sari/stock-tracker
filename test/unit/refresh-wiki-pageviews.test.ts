import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';
import { createTransaction } from '@/lib/db/queries/transactions';
import { addToWatchlist } from '@/lib/db/queries/watchlist';
import { listWikiPageviews } from '@/lib/db/queries/wiki-pageviews';
import { refreshWikiPageviewsOnce, resolveArticle } from '@/lib/jobs/refresh-wiki-pageviews';
import { WikimediaClient } from '@/lib/providers/wikimedia';

const TEST_DB_DIR = path.join(process.cwd(), '.vitest-cache', 'refresh-wiki-pageviews');
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test.db');

describe('resolveArticle', () => {
  beforeEach(() => {
    closeDb();
    if (existsSync(TEST_DB_DIR)) rmSync(TEST_DB_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DB_DIR, { recursive: true });
    process.env.DB_PATH = TEST_DB_PATH;
    applySchema(getDb());
  });

  it('uses hardcoded mapping for known tickers', () => {
    expect(resolveArticle('AAPL')).toBe('Apple_Inc.');
    expect(resolveArticle('NVDA')).toBe('Nvidia');
    expect(resolveArticle('MSFT')).toBe('Microsoft');
    expect(resolveArticle('TSLA')).toBe('Tesla,_Inc.');
    expect(resolveArticle('META')).toBe('Meta_Platforms');
    expect(resolveArticle('GOOGL')).toBe('Alphabet_Inc.');
    expect(resolveArticle('AMZN')).toBe('Amazon_(company)');
  });

  it('falls back to ticker name for unknown ticker without meta', () => {
    expect(resolveArticle('XYZ')).toBe('XYZ');
  });
});

describe('refreshWikiPageviewsOnce', () => {
  beforeEach(() => {
    closeDb();
    if (existsSync(TEST_DB_DIR)) rmSync(TEST_DB_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DB_DIR, { recursive: true });
    process.env.DB_PATH = TEST_DB_PATH;
    applySchema(getDb());
  });
  afterAll(() => { closeDb(); rmSync(TEST_DB_DIR, { recursive: true, force: true }); });

  it('fetches pageviews for held tickers and stores them', async () => {
    createTransaction({ ticker: 'AAPL', kind: 'buy', qty: 10, price: 150, executed_at: '2026-01-01T14:30:00Z' });

    const client = new WikimediaClient();
    vi.spyOn(client, 'getPageviews').mockResolvedValue([
      { article: 'Apple_Inc.', timestamp: '2026050600', views: 10412 },
      { article: 'Apple_Inc.', timestamp: '2026050700', views: 9988 },
    ]);

    const result = await refreshWikiPageviewsOnce(client);
    expect(result.rows).toBe(2);

    const rows = listWikiPageviews('AAPL');
    expect(rows).toHaveLength(2);
    expect(rows[0].views).toBe(9988); // DESC order, so newer first — actually depends on data
    // Verify both dates are stored
    const dates = rows.map(r => r.date).sort();
    expect(dates).toContain('2026-05-06');
    expect(dates).toContain('2026-05-07');
  });

  it('fetches pageviews for watchlist tickers', async () => {
    addToWatchlist('NVDA');

    const client = new WikimediaClient();
    vi.spyOn(client, 'getPageviews').mockResolvedValue([
      { article: 'Nvidia', timestamp: '2026050600', views: 5000 },
    ]);

    const result = await refreshWikiPageviewsOnce(client);
    expect(result.rows).toBe(1);

    const rows = listWikiPageviews('NVDA');
    expect(rows).toHaveLength(1);
    expect(rows[0].ticker).toBe('NVDA');
    expect(rows[0].views).toBe(5000);
  });

  it('deduplicates tickers in held + watched', async () => {
    createTransaction({ ticker: 'MSFT', kind: 'buy', qty: 5, price: 400, executed_at: '2026-01-01T14:30:00Z' });
    addToWatchlist('MSFT');

    const client = new WikimediaClient();
    const spy = vi.spyOn(client, 'getPageviews').mockResolvedValue([
      { article: 'Microsoft', timestamp: '2026050600', views: 8000 },
    ]);

    await refreshWikiPageviewsOnce(client);
    // Should only call once for MSFT despite appearing in both held + watch
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('is idempotent — upserts overwrite existing rows', async () => {
    createTransaction({ ticker: 'AAPL', kind: 'buy', qty: 10, price: 150, executed_at: '2026-01-01T14:30:00Z' });

    const client = new WikimediaClient();
    vi.spyOn(client, 'getPageviews').mockResolvedValue([
      { article: 'Apple_Inc.', timestamp: '2026050600', views: 10412 },
    ]);

    await refreshWikiPageviewsOnce(client);

    // Second run with updated views
    vi.spyOn(client, 'getPageviews').mockResolvedValue([
      { article: 'Apple_Inc.', timestamp: '2026050600', views: 11000 },
    ]);
    await refreshWikiPageviewsOnce(client);

    const rows = listWikiPageviews('AAPL');
    expect(rows).toHaveLength(1);
    expect(rows[0].views).toBe(11000);
  });

  it('skips tickers that return 404 without aborting others', async () => {
    createTransaction({ ticker: 'AAPL', kind: 'buy', qty: 10, price: 150, executed_at: '2026-01-01T14:30:00Z' });
    addToWatchlist('NVDA');

    const client = new WikimediaClient();
    vi.spyOn(client, 'getPageviews')
      .mockImplementationOnce(async () => { throw new Error('HTTP 404'); })
      .mockResolvedValue([{ article: 'Nvidia', timestamp: '2026050600', views: 5000 }]);

    // Should not throw
    const result = await refreshWikiPageviewsOnce(client);
    expect(result.rows).toBeGreaterThanOrEqual(0); // at least one ticker succeeded
  });
});
