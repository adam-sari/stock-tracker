import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';
import { GET } from '@/app/api/portfolio/activity/route';

const TEST_DB_DIR = path.join(process.cwd(), '.vitest-cache', 'api-portfolio-activity');
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test.db');

// Clear the module-level cache inside the route between tests
async function clearRouteCache() {
  // The route keeps a module-level _cache Map. We re-import after each db reset
  // so cache keys from prior runs with old data won't bleed through.
  // In practice the cache TTL is 30s and test data changes, so force bypass
  // by using a different limit value per test (or rely on beforeEach resetting DB).
}

describe('GET /api/portfolio/activity', () => {
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

  it('returns 200 with events key (empty when no holdings/watchlist)', async () => {
    const res = await GET(new Request('http://localhost/api/portfolio/activity'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('events');
    expect(Array.isArray(body.events)).toBe(true);
    expect(body.events).toHaveLength(0);
  });

  it('returns news events for held tickers', async () => {
    const db = getDb();
    // Create a holding (via transaction)
    db.prepare(`INSERT INTO transactions (ticker, kind, qty, price, executed_at) VALUES ('AAPL', 'buy', 5, 150, 1735732200)`).run();
    // Insert a news item for AAPL
    db.prepare(`INSERT INTO news (id, ticker, source, headline, url, published_at, fetched_at) VALUES ('news1', 'AAPL', 'reuters', 'Apple hits all time high', 'https://example.com/a', 1735732200, 1735732200)`).run();

    // Use a unique limit to avoid the 30s in-memory cache
    const res = await GET(new Request('http://localhost/api/portfolio/activity?limit=5'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events.length).toBeGreaterThan(0);
    const newsEvent = body.events.find((e: { kind: string; ticker: string }) => e.kind === 'news' && e.ticker === 'AAPL');
    expect(newsEvent).toBeDefined();
    expect(newsEvent.title).toBe('Apple hits all time high');
  });

  it('returns news events for watchlist tickers', async () => {
    const db = getDb();
    // Add to watchlist (no transaction)
    db.prepare(`INSERT INTO watchlist (ticker, source, added_at) VALUES ('TSLA', 'manual', 1735732200)`).run();
    db.prepare(`INSERT INTO news (id, ticker, source, headline, url, published_at, fetched_at) VALUES ('n2', 'TSLA', 'cnbc', 'Tesla expands', 'https://example.com/b', 1735732210, 1735732210)`).run();

    const res = await GET(new Request('http://localhost/api/portfolio/activity?limit=6'));
    expect(res.status).toBe(200);
    const body = await res.json();
    const tslaEvent = body.events.find((e: { ticker: string }) => e.ticker === 'TSLA');
    expect(tslaEvent).toBeDefined();
  });

  it('respects the limit query parameter', async () => {
    const db = getDb();
    db.prepare(`INSERT INTO transactions (ticker, kind, qty, price, executed_at) VALUES ('AAPL', 'buy', 5, 150, 1735732200)`).run();
    for (let i = 0; i < 10; i++) {
      db.prepare(`INSERT INTO news (id, ticker, source, headline, url, published_at, fetched_at) VALUES (?, 'AAPL', 'test', ?, ?, ?, ?)`)
        .run(`n${i}`, `headline ${i}`, `https://example.com/${i}`, 1735732200 + i, 1735732200 + i);
    }

    const res = await GET(new Request('http://localhost/api/portfolio/activity?limit=3'));
    expect(res.status).toBe(200);
    const body = await res.json();
    // limit=3 is the key used; cache shouldn't collide with limit=5 or 6 from other tests
    expect(body.events.length).toBeLessThanOrEqual(3);
  });
});
