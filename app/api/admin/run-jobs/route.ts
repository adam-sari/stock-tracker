import { NextResponse } from 'next/server';
import { pollQuotesOnce } from '@/lib/jobs/poll-quotes';
import { refreshNewsOnce } from '@/lib/jobs/refresh-news';
import { refreshSentimentOnce } from '@/lib/jobs/refresh-sentiment';
import { refreshCongressOnce } from '@/lib/jobs/refresh-congress';
import { refreshHaltsOnce } from '@/lib/jobs/refresh-halts';
import { refreshEarningsOnce } from '@/lib/jobs/refresh-earnings';
import { refreshRecommendationsOnce } from '@/lib/jobs/refresh-recommendations';
import { refreshInsiderSentimentOnce } from '@/lib/jobs/refresh-insider-sentiment';
import { refreshCorporateActionsOnce } from '@/lib/jobs/refresh-corporate-actions';
import { computeDiscoveryOnce } from '@/lib/jobs/compute-discovery';
import { refreshWikiPageviewsOnce } from '@/lib/jobs/refresh-wiki-pageviews';
import { refreshEdgarAlertsOnce } from '@/lib/jobs/refresh-edgar-alerts';
import { refreshStockMetaOnce } from '@/lib/jobs/refresh-stock-meta';
import { refreshDodContractsOnce } from '@/lib/jobs/refresh-dod-contracts';
import { refreshFdaCalendarOnce } from '@/lib/jobs/refresh-fda-calendar';
import { refreshArkTradesOnce } from '@/lib/jobs/refresh-ark-trades';
import { refreshCabinetTradesOnce } from '@/lib/jobs/refresh-cabinet-trades';
import { refreshHiringOnce } from '@/lib/jobs/refresh-hiring';
import {
  quoteChain,
  finnhubClient,
  fmpClient,
  apewisdomClient,
  nasdaqHaltsClient,
} from '@/lib/providers';
import { YahooProvider } from '@/lib/providers/yahoo';

type JobResult = { job: string; status: 'ok' | 'error'; detail?: string };

async function safeRun(
  name: string,
  fn: () => Promise<unknown>,
): Promise<JobResult> {
  try {
    await fn();
    return { job: name, status: 'ok' };
  } catch (e) {
    return { job: name, status: 'error', detail: (e as Error).message };
  }
}

/**
 * POST /api/admin/run-jobs
 *
 * Triggers immediate execution of all non-streaming jobs sequentially.
 * Useful for first-time setup when the user wants data NOW without
 * waiting for the scheduled cron intervals.
 */
export async function POST() {
  const yahooForActions = new YahooProvider();

  const results: JobResult[] = [];

  // Run jobs in a sensible order (meta first, then prices, then derived data)
  results.push(await safeRun('refresh-stock-meta', () => refreshStockMetaOnce(fmpClient(), finnhubClient())));
  results.push(await safeRun('poll-quotes', () => pollQuotesOnce(quoteChain())));
  results.push(await safeRun('refresh-news', () => refreshNewsOnce(finnhubClient())));
  results.push(await safeRun('refresh-earnings', () => refreshEarningsOnce(finnhubClient())));
  results.push(await safeRun('refresh-recommendations', () => refreshRecommendationsOnce(finnhubClient())));
  results.push(await safeRun('refresh-sentiment', () => refreshSentimentOnce(apewisdomClient())));
  results.push(await safeRun('refresh-congress', () => refreshCongressOnce(fmpClient())));
  results.push(await safeRun('refresh-halts', () => refreshHaltsOnce(nasdaqHaltsClient())));
  results.push(await safeRun('refresh-insider-sentiment', () => refreshInsiderSentimentOnce(finnhubClient())));
  results.push(await safeRun('refresh-corporate-actions', () => refreshCorporateActionsOnce(fmpClient(), yahooForActions)));
  results.push(await safeRun('refresh-wiki-pageviews', () => refreshWikiPageviewsOnce()));
  results.push(await safeRun('refresh-edgar-alerts', () => refreshEdgarAlertsOnce()));
  results.push(await safeRun('refresh-dod-contracts', () => refreshDodContractsOnce()));
  results.push(await safeRun('refresh-fda-calendar', () => refreshFdaCalendarOnce(finnhubClient())));
  results.push(await safeRun('refresh-ark-trades', () => refreshArkTradesOnce()));
  results.push(await safeRun('refresh-cabinet-trades', () => refreshCabinetTradesOnce()));
  results.push(await safeRun('refresh-hiring', () => refreshHiringOnce()));
  results.push(await safeRun('compute-discovery', () => computeDiscoveryOnce()));

  const errors = results.filter(r => r.status === 'error');
  return NextResponse.json({
    ran: results.length,
    ok: results.length - errors.length,
    errors: errors.length,
    results,
  });
}
