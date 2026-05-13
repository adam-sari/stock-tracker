import { getCandles1m, getCandlesDaily } from './candles';
import type { CandlePoint } from '../../computations/portfolio-series';

/**
 * Fetch candle data for a ticker for the portfolio value time series.
 *
 * For 1m interval: reads from candles_1m table.
 * For 1d interval: reads from candles_daily table, converting date strings to timestamps.
 */
export function getCandlesForTicker(
  ticker: string,
  interval: '1m' | '1d',
  fromTs: number,
  toTs: number,
): CandlePoint[] {
  if (interval === '1m') {
    const bars = getCandles1m(ticker, fromTs, toTs);
    return bars.map(b => ({ ts: b.ts, close: b.close }));
  }

  // 1d: convert timestamps to date strings for candles_daily
  const fromDate = new Date(fromTs * 1000).toISOString().slice(0, 10);
  const toDate = new Date(toTs * 1000).toISOString().slice(0, 10);
  const rows = getCandlesDaily(ticker, fromDate, toDate);
  return rows.map(r => ({
    ts: Math.floor(new Date(r.date + 'T00:00:00Z').getTime() / 1000),
    close: r.close,
  }));
}
