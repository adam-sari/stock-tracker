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
import { refreshWikiPageviewsOnce } from './refresh-wiki-pageviews';
import { refreshEdgarAlertsOnce } from './refresh-edgar-alerts';
import { refreshDodContractsOnce } from './refresh-dod-contracts';
import { refreshFdaCalendarOnce } from './refresh-fda-calendar';
import { refreshArkTradesOnce } from './refresh-ark-trades';
import { refreshCabinetTradesOnce } from './refresh-cabinet-trades';
import { refreshHiringOnce } from './refresh-hiring';
import { quoteChain, finnhubClient, fmpClient, apewisdomClient, nasdaqHaltsClient } from '../providers';
import { YahooProvider } from '../providers/yahoo';

const yahooForActions = new YahooProvider();

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
  cron.schedule('0 3 * * *', safeRun('refresh-corporate-actions', () => refreshCorporateActionsOnce(fmpClient(), yahooForActions)));

  // Discovery score recomputation: daily 06:00 UTC
  cron.schedule('0 6 * * *', safeRun('compute-discovery', () => computeDiscoveryOnce()));

  // Wikipedia pageviews (attention proxy): daily 02:00 UTC
  cron.schedule('0 2 * * *', safeRun('refresh-wiki-pageviews', () => refreshWikiPageviewsOnce()));

  // SEC EDGAR full-text alerts (going concern, MAC, restatement): daily 23:00 UTC
  cron.schedule('0 23 * * *', safeRun('refresh-edgar-alerts', () => refreshEdgarAlertsOnce()));

  // DOD contract awards via USAspending (defense names): daily 04:00 UTC
  cron.schedule('0 4 * * *', safeRun('refresh-dod-contracts', () => refreshDodContractsOnce()));

  // FDA advisory committee calendar (biotech catalysts): weekly Sun 05:00 UTC
  cron.schedule('0 5 * * 0', safeRun('refresh-fda-calendar', () => refreshFdaCalendarOnce(finnhubClient())));

  // ARK Invest daily trades (Cathie Wood smart-money proxy): daily 02:30 UTC
  cron.schedule('30 2 * * *', safeRun('refresh-ark-trades', () => refreshArkTradesOnce()));

  // Executive branch trades via Open Cabinet (OGE Form 278-T): daily 05:30 UTC
  cron.schedule('30 5 * * *', safeRun('refresh-cabinet-trades', () => refreshCabinetTradesOnce()));

  // Hiring velocity via Greenhouse public API (tech names): daily 04:30 UTC
  cron.schedule('30 4 * * *', safeRun('refresh-hiring', () => refreshHiringOnce()));

  console.log('[scheduler] started with 18 jobs');
}
