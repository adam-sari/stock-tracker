import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';
import { GET } from '@/app/api/portfolio/earnings/route';

const TEST_DB_DIR = path.join(process.cwd(), '.vitest-cache', 'api-portfolio-earnings');
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test.db');

describe('GET /api/portfolio/earnings', () => {
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

  it('returns 200 with earnings key (empty when no holdings)', async () => {
    const res = await GET(new Request('http://localhost/api/portfolio/earnings'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('earnings');
    expect(Array.isArray(body.earnings)).toBe(true);
    expect(body.earnings).toHaveLength(0);
  });

  it('returns upcoming earnings for held tickers within default 30-day window', async () => {
    const db = getDb();
    // Create a holding
    db.prepare(`INSERT INTO transactions (ticker, kind, qty, price, executed_at) VALUES ('AAPL', 'buy', 5, 150, 1735732200)`).run();

    // Insert an earnings event 10 days from now
    const futureDate = new Date(Date.now() + 10 * 86400_000).toISOString().slice(0, 10);
    db.prepare(`INSERT INTO earnings_calendar (ticker, earnings_date, hour, source) VALUES ('AAPL', ?, 'amc', 'finnhub')`).run(futureDate);

    const res = await GET(new Request('http://localhost/api/portfolio/earnings?days=11'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.earnings).toHaveLength(1);
    expect(body.earnings[0].ticker).toBe('AAPL');
    expect(body.earnings[0].earnings_date).toBe(futureDate);
  });

  it('excludes earnings beyond the days window', async () => {
    const db = getDb();
    db.prepare(`INSERT INTO transactions (ticker, kind, qty, price, executed_at) VALUES ('AAPL', 'buy', 5, 150, 1735732200)`).run();

    // Insert an earnings event 60 days from now
    const farDate = new Date(Date.now() + 60 * 86400_000).toISOString().slice(0, 10);
    db.prepare(`INSERT INTO earnings_calendar (ticker, earnings_date, hour, source) VALUES ('AAPL', ?, 'bmo', 'finnhub')`).run(farDate);

    const res = await GET(new Request('http://localhost/api/portfolio/earnings?days=15'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.earnings).toHaveLength(0);
  });

  it('excludes earnings for tickers not in holdings', async () => {
    const db = getDb();
    // No holdings for TSLA
    const futureDate = new Date(Date.now() + 5 * 86400_000).toISOString().slice(0, 10);
    db.prepare(`INSERT INTO earnings_calendar (ticker, earnings_date, hour, source) VALUES ('TSLA', ?, 'amc', 'finnhub')`).run(futureDate);

    const res = await GET(new Request('http://localhost/api/portfolio/earnings?days=9'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.earnings).toHaveLength(0);
  });

  it('returns earnings ordered by earnings_date ascending', async () => {
    const db = getDb();
    db.prepare(`INSERT INTO transactions (ticker, kind, qty, price, executed_at) VALUES ('AAPL', 'buy', 5, 150, 1735732200)`).run();
    db.prepare(`INSERT INTO transactions (ticker, kind, qty, price, executed_at) VALUES ('MSFT', 'buy', 3, 300, 1735732200)`).run();

    const date1 = new Date(Date.now() + 5 * 86400_000).toISOString().slice(0, 10);
    const date2 = new Date(Date.now() + 15 * 86400_000).toISOString().slice(0, 10);
    // Insert in reverse chronological order
    db.prepare(`INSERT INTO earnings_calendar (ticker, earnings_date, hour, source) VALUES ('MSFT', ?, 'bmo', 'finnhub')`).run(date2);
    db.prepare(`INSERT INTO earnings_calendar (ticker, earnings_date, hour, source) VALUES ('AAPL', ?, 'amc', 'finnhub')`).run(date1);

    const res = await GET(new Request('http://localhost/api/portfolio/earnings?days=20'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.earnings).toHaveLength(2);
    expect(body.earnings[0].ticker).toBe('AAPL');
    expect(body.earnings[1].ticker).toBe('MSFT');
  });
});
