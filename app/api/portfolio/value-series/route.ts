import { NextResponse } from 'next/server';
import { listTransactions } from '@/lib/db/queries/transactions';
import { getCandlesForTicker } from '@/lib/db/queries/portfolio-series';
import { upsertCandlesDaily } from '@/lib/db/queries/candles';
import { computePortfolioSeries } from '@/lib/computations/portfolio-series';
import { dailyBarsChain } from '@/lib/providers';
import type { CandlePoint } from '@/lib/computations/portfolio-series';

const DAY = 86_400_000;

/**
 * Determine interval and start date from the range parameter.
 * Ranges ≤5d use 1m candles; others use 1d candles.
 */
function resolveRange(range: string, end: Date): { interval: '1m' | '1d'; start: Date } {
  const ms = end.getTime();
  switch (range) {
    case '1d':
      return { interval: '1m', start: new Date(ms - DAY) };
    case '5d':
      return { interval: '1m', start: new Date(ms - 5 * DAY) };
    case '1m':
      return { interval: '1d', start: new Date(ms - 30 * DAY) };
    case '3m':
      return { interval: '1d', start: new Date(ms - 90 * DAY) };
    case 'ytd':
      return { interval: '1d', start: new Date(`${end.getUTCFullYear()}-01-01T00:00:00Z`) };
    case '1y':
      return { interval: '1d', start: new Date(ms - 365 * DAY) };
    case 'all':
      return { interval: '1d', start: new Date('2000-01-01T00:00:00Z') };
    default:
      return { interval: '1m', start: new Date(ms - DAY) };
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const range = url.searchParams.get('range') ?? '1d';
  const end = new Date();
  const { interval, start } = resolveRange(range, end);

  const fromTs = Math.floor(start.getTime() / 1000);
  const toTs = Math.floor(end.getTime() / 1000);

  // Load all transactions sorted ASC
  const allTxns = listTransactions();
  const txnsSortedAsc = [...allTxns].sort(
    (a, b) => new Date(a.executed_at).getTime() - new Date(b.executed_at).getTime(),
  );

  // Collect distinct tickers from transactions
  const tickers = [...new Set(allTxns.map(t => t.ticker))];

  // Load candles for each ticker; for 1d, backfill from provider if empty
  const candlesByTicker = new Map<string, CandlePoint[]>();

  await Promise.all(
    tickers.map(async ticker => {
      let candles = getCandlesForTicker(ticker, interval, fromTs, toTs);

      if (candles.length === 0 && interval === '1d') {
        // Backfill: fetch from provider chain and store
        try {
          const bars = await dailyBarsChain().getDailyBars(ticker, { start, end });
          if (bars.length > 0) {
            upsertCandlesDaily(bars, 'backfill');
            // Re-read from DB to ensure consistent timestamp format
            candles = getCandlesForTicker(ticker, interval, fromTs, toTs);
          }
        } catch {
          // Backfill failed; candles stays empty, ticker will contribute 0 value
        }
      }

      candlesByTicker.set(ticker, candles);
    }),
  );

  const series = computePortfolioSeries(txnsSortedAsc, candlesByTicker, start, end);
  return NextResponse.json(series);
}
