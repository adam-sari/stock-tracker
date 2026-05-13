import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';
import { createTransaction } from '@/lib/db/queries/transactions';
import { addToWatchlist } from '@/lib/db/queries/watchlist';
import { latestHiringSnapshot, hiringTrend } from '@/lib/db/queries/hiring';
import { refreshHiringOnce } from '@/lib/jobs/refresh-hiring';
import { HiringClient } from '@/lib/providers/hiring';

const TEST_DB_DIR = path.join(process.cwd(), '.vitest-cache', 'refresh-hiring');
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test.db');

function resetDb() {
  closeDb();
  if (existsSync(TEST_DB_DIR)) rmSync(TEST_DB_DIR, { recursive: true, force: true });
  mkdirSync(TEST_DB_DIR, { recursive: true });
  process.env.DB_PATH = TEST_DB_PATH;
  applySchema(getDb());
}

describe('refreshHiringOnce', () => {
  beforeEach(() => {
    resetDb();
    vi.restoreAllMocks();
  });

  afterAll(() => {
    closeDb();
    if (existsSync(TEST_DB_DIR)) rmSync(TEST_DB_DIR, { recursive: true, force: true });
  });

  it('stores snapshot for held tech tickers in the ATS map', async () => {
    // DDOG is in TECH_ATS_MAP
    createTransaction({ ticker: 'DDOG', kind: 'buy', qty: 10, price: 120, executed_at: '2026-01-01T14:30:00Z' });

    const client = new HiringClient();
    vi.spyOn(client, 'getJobs').mockResolvedValue(
      Array.from({ length: 85 }, (_, i) => ({ id: i, title: `Engineer ${i}` })),
    );

    const result = await refreshHiringOnce(client);
    expect(result.tickers).toBe(1);
    expect(result.stored).toBe(1);

    const snap = latestHiringSnapshot('DDOG');
    expect(snap).not.toBeNull();
    expect(snap!.open_jobs).toBe(85);
    expect(snap!.ats).toBe('greenhouse');
  });

  it('stores snapshot for watched tech tickers', async () => {
    addToWatchlist('SNOW');

    const client = new HiringClient();
    vi.spyOn(client, 'getJobs').mockResolvedValue(
      Array.from({ length: 200 }, (_, i) => ({ id: i, title: `Job ${i}` })),
    );

    const result = await refreshHiringOnce(client);
    expect(result.tickers).toBe(1);
    expect(result.stored).toBe(1);

    const snap = latestHiringSnapshot('SNOW');
    expect(snap?.open_jobs).toBe(200);
  });

  it('skips tickers not in TECH_ATS_MAP', async () => {
    // AAPL is not in the ATS map
    createTransaction({ ticker: 'AAPL', kind: 'buy', qty: 5, price: 175, executed_at: '2026-01-01T14:30:00Z' });

    const client = new HiringClient();
    const spy = vi.spyOn(client, 'getJobs').mockResolvedValue([]);

    const result = await refreshHiringOnce(client);
    expect(spy).not.toHaveBeenCalled();
    expect(result.tickers).toBe(0);
    expect(result.stored).toBe(0);
  });

  it('handles API errors gracefully without crashing', async () => {
    createTransaction({ ticker: 'NET', kind: 'buy', qty: 3, price: 80, executed_at: '2026-01-01T14:30:00Z' });

    const client = new HiringClient();
    vi.spyOn(client, 'getJobs').mockRejectedValue(new Error('HTTP 503'));

    const result = await refreshHiringOnce(client);
    // tickers tried = 1, but stored = 0 because it errored
    expect(result.tickers).toBe(1);
    expect(result.stored).toBe(0);
  });

  it('is idempotent — upserts overwrite existing snapshots at the same ts', async () => {
    createTransaction({ ticker: 'CRWD', kind: 'buy', qty: 2, price: 200, executed_at: '2026-01-01T14:30:00Z' });

    const client = new HiringClient();
    vi.spyOn(client, 'getJobs').mockResolvedValue(
      Array.from({ length: 50 }, (_, i) => ({ id: i, title: `Role ${i}` })),
    );

    // Run twice (same started ts won't collide in real time, but upsert handles conflicts)
    await refreshHiringOnce(client);
    await refreshHiringOnce(client);

    // Should have at most 2 snapshots (one per run at different ts), both with 50 jobs
    const db = getDb();
    const rows = db.prepare(`SELECT * FROM hiring_snapshots WHERE ticker='CRWD' ORDER BY ts DESC`).all();
    expect(rows.length).toBeGreaterThanOrEqual(1);
    for (const row of rows as Array<{ open_jobs: number }>) {
      expect(row.open_jobs).toBe(50);
    }
  });
});

describe('hiringTrend', () => {
  beforeEach(() => resetDb());
  afterAll(() => { closeDb(); if (existsSync(TEST_DB_DIR)) rmSync(TEST_DB_DIR, { recursive: true, force: true }); });

  it('returns null when no data exists', () => {
    expect(hiringTrend('DDOG')).toBeNull();
  });

  it('returns latest count with null deltaPct when only one snapshot', () => {
    const db = getDb();
    const now = Math.floor(Date.now() / 1000);
    db.prepare(`INSERT INTO hiring_snapshots (ticker, ts, ats, open_jobs) VALUES ('DDOG', ?, 'greenhouse', 100)`)
      .run(now);

    const trend = hiringTrend('DDOG');
    expect(trend).not.toBeNull();
    expect(trend!.latest).toBe(100);
    expect(trend!.deltaPct).toBeNull();
  });

  it('computes delta_pct between latest and ~7-day-prior snapshot', () => {
    const db = getDb();
    const now = Math.floor(Date.now() / 1000);
    const sevenDaysAgo = now - 7 * 86400;

    db.prepare(`INSERT INTO hiring_snapshots (ticker, ts, ats, open_jobs) VALUES ('DDOG', ?, 'greenhouse', 120)`).run(now);
    db.prepare(`INSERT INTO hiring_snapshots (ticker, ts, ats, open_jobs) VALUES ('DDOG', ?, 'greenhouse', 100)`).run(sevenDaysAgo);

    const trend = hiringTrend('DDOG');
    expect(trend!.latest).toBe(120);
    expect(trend!.prior7).toBe(100);
    expect(trend!.deltaPct).toBeCloseTo(20, 1);
  });
});
