import cron from 'node-cron';
import { pollQuotesOnce } from './poll-quotes';
import { refreshNewsOnce } from './refresh-news';
import { refreshStockMetaOnce } from './refresh-stock-meta';
import { refreshSentimentOnce } from './refresh-sentiment';
import { refreshCongressOnce } from './refresh-congress';
import { refreshHaltsOnce } from './refresh-halts';
import { refreshEarningsOnce } from './refresh-earnings';
import { refreshRecommendationsOnce } from './refresh-recommendations';
import { refreshInsiderSentimentOnce } from './refresh-insider-sentiment';
import { refreshCorporateActionsOnce } from './refresh-corporate-actions';
import { computeDiscoveryOnce } from './compute-discovery';
import { quoteChain, finnhubClient, fmpClient, apewisdomClient, nasdaqHaltsClient } from '../providers';

let started = false;

function safeRun(name: string, fn: () => Promise<unknown>) {
  return async () => {
    try { await fn(); }
    catch (e) { console.error(`[${name}] failed:`, e); }
  };
}

export function startSchedulers() {
  if (started) return;
  started = true;

  // Live prices: every 30s
  cron.schedule('*/30 * * * * *', safeRun('poll-quotes', () => pollQuotesOnce(quoteChain())));

  // News: hourly
  cron.schedule('0 * * * *', safeRun('refresh-news', () => refreshNewsOnce(finnhubClient())));

  // Stock meta: weekly Sunday 03:00 UTC
  cron.schedule('0 3 * * 0', safeRun('refresh-stock-meta', () => refreshStockMetaOnce(fmpClient(), finnhubClient())));

  // Sentiment: every 30 minutes
  cron.schedule('*/30 * * * *', safeRun('refresh-sentiment', () => refreshSentimentOnce(apewisdomClient())));

  // Congress: every 4 hours
  cron.schedule('0 */4 * * *', safeRun('refresh-congress', () => refreshCongressOnce(fmpClient())));

  // Halts: every minute during market hours (13-20 UTC weekdays)
  cron.schedule('* 13-20 * * 1-5', safeRun('refresh-halts', () => refreshHaltsOnce(nasdaqHaltsClient())));

  // Earnings calendar: daily 02:00 UTC
  cron.schedule('0 2 * * *', safeRun('refresh-earnings', () => refreshEarningsOnce(finnhubClient())));

  // Recommendations: daily 02:30 UTC
  cron.schedule('30 2 * * *', safeRun('refresh-recommendations', () => refreshRecommendationsOnce(finnhubClient())));

  // Insider sentiment monthly: weekly Mon 04:00 UTC
  cron.schedule('0 4 * * 1', safeRun('refresh-insider-sentiment', () => refreshInsiderSentimentOnce(finnhubClient())));

  // Corporate actions: daily 03:00 UTC
  cron.schedule('0 3 * * *', safeRun('refresh-corporate-actions', () => refreshCorporateActionsOnce(fmpClient())));

  // Discovery score recomputation: daily 06:00 UTC
  cron.schedule('0 6 * * *', safeRun('compute-discovery', () => computeDiscoveryOnce()));

  console.log('[scheduler] started with 11 jobs');
}
