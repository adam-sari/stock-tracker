import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';

const TEST_DB_DIR = path.join(process.cwd(), '.vitest-cache', 'api-admin-run-jobs');
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test.db');

// Mock all job modules before importing the route
vi.mock('@/lib/jobs/poll-quotes', () => ({
  pollQuotesOnce: vi.fn().mockResolvedValue({ updated: 0 }),
}));
vi.mock('@/lib/jobs/refresh-news', () => ({
  refreshNewsOnce: vi.fn().mockResolvedValue({ inserted: 0 }),
}));
vi.mock('@/lib/jobs/refresh-sentiment', () => ({
  refreshSentimentOnce: vi.fn().mockResolvedValue({ snapshots: 0 }),
}));
vi.mock('@/lib/jobs/refresh-congress', () => ({
  refreshCongressOnce: vi.fn().mockResolvedValue({ inserted: 0 }),
}));
vi.mock('@/lib/jobs/refresh-halts', () => ({
  refreshHaltsOnce: vi.fn().mockResolvedValue({ inserted: 0 }),
}));
vi.mock('@/lib/jobs/refresh-earnings', () => ({
  refreshEarningsOnce: vi.fn().mockResolvedValue({ inserted: 0 }),
}));
vi.mock('@/lib/jobs/refresh-recommendations', () => ({
  refreshRecommendationsOnce: vi.fn().mockResolvedValue({ inserted: 0 }),
}));
vi.mock('@/lib/jobs/refresh-insider-sentiment', () => ({
  refreshInsiderSentimentOnce: vi.fn().mockResolvedValue({ inserted: 0 }),
}));
vi.mock('@/lib/jobs/refresh-corporate-actions', () => ({
  refreshCorporateActionsOnce: vi.fn().mockResolvedValue({ inserted: 0 }),
}));
vi.mock('@/lib/jobs/compute-discovery', () => ({
  computeDiscoveryOnce: vi.fn().mockResolvedValue({ scored: 0 }),
}));
vi.mock('@/lib/jobs/refresh-wiki-pageviews', () => ({
  refreshWikiPageviewsOnce: vi.fn().mockResolvedValue({ updated: 0 }),
}));
vi.mock('@/lib/jobs/refresh-edgar-alerts', () => ({
  refreshEdgarAlertsOnce: vi.fn().mockResolvedValue({ phrases: 0, hits: 0, stored: 0 }),
}));
vi.mock('@/lib/jobs/refresh-stock-meta', () => ({
  refreshStockMetaOnce: vi.fn().mockResolvedValue({ updated: 0 }),
}));
vi.mock('@/lib/jobs/refresh-dod-contracts', () => ({
  refreshDodContractsOnce: vi.fn().mockResolvedValue({ tickers: 0, stored: 0 }),
}));
vi.mock('@/lib/jobs/refresh-fda-calendar', () => ({
  refreshFdaCalendarOnce: vi.fn().mockResolvedValue({ inserted: 0 }),
}));
vi.mock('@/lib/jobs/refresh-ark-trades', () => ({
  refreshArkTradesOnce: vi.fn().mockResolvedValue({ inserted: 0 }),
}));
vi.mock('@/lib/jobs/refresh-cabinet-trades', () => ({
  refreshCabinetTradesOnce: vi.fn().mockResolvedValue({ inserted: 0 }),
}));
vi.mock('@/lib/jobs/refresh-hiring', () => ({
  refreshHiringOnce: vi.fn().mockResolvedValue({ inserted: 0 }),
}));

// Mock providers so we never hit real env or network
vi.mock('@/lib/providers', () => ({
  quoteChain: vi.fn().mockReturnValue({ getLatestQuote: vi.fn().mockResolvedValue(null) }),
  finnhubClient: vi.fn().mockReturnValue({}),
  fmpClient: vi.fn().mockReturnValue({}),
  apewisdomClient: vi.fn().mockReturnValue({}),
  nasdaqHaltsClient: vi.fn().mockReturnValue({}),
  resetChains: vi.fn(),
}));

vi.mock('@/lib/providers/yahoo', () => ({
  YahooProvider: vi.fn().mockImplementation(() => ({})),
}));

describe('POST /api/admin/run-jobs', () => {
  beforeEach(() => {
    closeDb();
    if (existsSync(TEST_DB_DIR)) rmSync(TEST_DB_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DB_DIR, { recursive: true });
    process.env.DB_PATH = TEST_DB_PATH;
    applySchema(getDb());
  });

  afterAll(() => {
    vi.restoreAllMocks();
    closeDb();
    rmSync(TEST_DB_DIR, { recursive: true, force: true });
  });

  it('returns ran=18, ok=18, errors=0 when all jobs succeed', async () => {
    const { POST } = await import('@/app/api/admin/run-jobs/route');
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ran).toBe(18);
    expect(body.ok).toBe(18);
    expect(body.errors).toBe(0);
    expect(Array.isArray(body.results)).toBe(true);
    expect(body.results).toHaveLength(18);
    for (const result of body.results) {
      expect(result.status).toBe('ok');
      expect(result.job).toBeTruthy();
    }
  });

  it('captures errors in results without throwing', async () => {
    const { pollQuotesOnce } = await import('@/lib/jobs/poll-quotes');
    vi.mocked(pollQuotesOnce).mockRejectedValueOnce(new Error('network timeout'));

    const { POST } = await import('@/app/api/admin/run-jobs/route');
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ran).toBe(18);
    expect(body.errors).toBe(1);
    expect(body.ok).toBe(17);
    const failed = body.results.find((r: { job: string }) => r.job === 'poll-quotes');
    expect(failed.status).toBe('error');
    expect(failed.detail).toContain('network timeout');
  });

  it('results contain all 18 expected job names', async () => {
    const { POST } = await import('@/app/api/admin/run-jobs/route');
    const res = await POST();
    const body = await res.json();
    const jobNames = body.results.map((r: { job: string }) => r.job);
    const expectedJobs = [
      'refresh-stock-meta', 'poll-quotes', 'refresh-news', 'refresh-earnings',
      'refresh-recommendations', 'refresh-sentiment', 'refresh-congress',
      'refresh-halts', 'refresh-insider-sentiment', 'refresh-corporate-actions',
      'refresh-wiki-pageviews', 'refresh-edgar-alerts', 'refresh-dod-contracts',
      'refresh-fda-calendar', 'refresh-ark-trades', 'refresh-cabinet-trades',
      'refresh-hiring', 'compute-discovery',
    ];
    for (const name of expectedJobs) {
      expect(jobNames).toContain(name);
    }
  });
});
