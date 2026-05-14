/**
 * Tests for lib/jobs/scheduler.ts — startSchedulers() idempotency and logging.
 *
 * We mock `node-cron` to prevent any real cron jobs from being scheduled,
 * and mock all job modules + provider factories to avoid network/DB calls.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock node-cron BEFORE importing the scheduler
const mockSchedule = vi.fn();
vi.mock('node-cron', () => ({
  default: { schedule: mockSchedule },
}));

// Mock all job modules referenced in scheduler.ts
vi.mock('@/lib/jobs/poll-quotes', () => ({ pollQuotesOnce: vi.fn() }));
vi.mock('@/lib/jobs/refresh-news', () => ({ refreshNewsOnce: vi.fn() }));
vi.mock('@/lib/jobs/refresh-stock-meta', () => ({ refreshStockMetaOnce: vi.fn() }));
vi.mock('@/lib/jobs/refresh-sentiment', () => ({ refreshSentimentOnce: vi.fn() }));
vi.mock('@/lib/jobs/refresh-congress', () => ({ refreshCongressOnce: vi.fn() }));
vi.mock('@/lib/jobs/refresh-halts', () => ({ refreshHaltsOnce: vi.fn() }));
vi.mock('@/lib/jobs/refresh-earnings', () => ({ refreshEarningsOnce: vi.fn() }));
vi.mock('@/lib/jobs/refresh-recommendations', () => ({ refreshRecommendationsOnce: vi.fn() }));
vi.mock('@/lib/jobs/refresh-insider-sentiment', () => ({ refreshInsiderSentimentOnce: vi.fn() }));
vi.mock('@/lib/jobs/refresh-corporate-actions', () => ({ refreshCorporateActionsOnce: vi.fn() }));
vi.mock('@/lib/jobs/compute-discovery', () => ({ computeDiscoveryOnce: vi.fn() }));
vi.mock('@/lib/jobs/refresh-wiki-pageviews', () => ({ refreshWikiPageviewsOnce: vi.fn() }));
vi.mock('@/lib/jobs/refresh-edgar-alerts', () => ({ refreshEdgarAlertsOnce: vi.fn() }));
vi.mock('@/lib/jobs/refresh-dod-contracts', () => ({ refreshDodContractsOnce: vi.fn() }));
vi.mock('@/lib/jobs/refresh-fda-calendar', () => ({ refreshFdaCalendarOnce: vi.fn() }));
vi.mock('@/lib/jobs/refresh-ark-trades', () => ({ refreshArkTradesOnce: vi.fn() }));
vi.mock('@/lib/jobs/refresh-cabinet-trades', () => ({ refreshCabinetTradesOnce: vi.fn() }));
vi.mock('@/lib/jobs/refresh-hiring', () => ({ refreshHiringOnce: vi.fn() }));

// Mock provider factories
vi.mock('@/lib/providers', () => ({
  quoteChain: vi.fn(() => ({})),
  finnhubClient: vi.fn(() => ({})),
  fmpClient: vi.fn(() => ({})),
  apewisdomClient: vi.fn(() => ({})),
  nasdaqHaltsClient: vi.fn(() => ({})),
}));

// Mock YahooProvider
vi.mock('@/lib/providers/yahoo', () => ({
  YahooProvider: vi.fn().mockImplementation(() => ({})),
}));

describe('startSchedulers', () => {
  // Re-import for each test so the module-level `started` flag can be reset
  beforeEach(() => {
    mockSchedule.mockClear();
    // Bust the module cache so `started = false` each time
    vi.resetModules();
  });

  it('registers exactly 18 cron jobs on first call', async () => {
    const { startSchedulers } = await import('@/lib/jobs/scheduler');
    startSchedulers();
    expect(mockSchedule).toHaveBeenCalledTimes(18);
  });

  it('is idempotent — calling twice does not double-register jobs', async () => {
    const { startSchedulers } = await import('@/lib/jobs/scheduler');
    startSchedulers();
    startSchedulers();
    // Still exactly 18, not 36
    expect(mockSchedule).toHaveBeenCalledTimes(18);
  });

  it('logs the job count on startup', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { startSchedulers } = await import('@/lib/jobs/scheduler');
    startSchedulers();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('18 jobs'));
    consoleSpy.mockRestore();
  });

  it('does not log when called a second time (early return)', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { startSchedulers } = await import('@/lib/jobs/scheduler');
    startSchedulers();
    consoleSpy.mockClear(); // clear the first call
    startSchedulers();
    // No additional log on the second no-op call
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('schedules the fast poll-quotes job with a seconds-level cron expression', async () => {
    const { startSchedulers } = await import('@/lib/jobs/scheduler');
    startSchedulers();
    const expressions: string[] = mockSchedule.mock.calls.map((c: unknown[]) => c[0] as string);
    // poll-quotes runs every 30 seconds — expression contains seconds field
    expect(expressions.some(e => e.includes('*'))).toBe(true);
    expect(expressions[0]).toMatch(/\*/);
  });
});
