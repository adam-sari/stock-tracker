import type { MarketDataProvider, Quote, Bar, BarsOpts, ProviderHealth, Session } from './types';
import { ProviderError } from './types';
import { sessionFor } from './session';
import { fetchWithTimeout, TIMEOUT_QUOTE_MS, TIMEOUT_BULK_MS } from './fetch-timeout';

type YahooMeta = {
  symbol: string;
  regularMarketPrice: number;
  regularMarketTime: number;
  hasPrePostMarketData: boolean;
  tradingPeriods?: {
    pre?: Array<Array<{ start: number; end: number }>>;
    regular?: Array<Array<{ start: number; end: number }>>;
    post?: Array<Array<{ start: number; end: number }>>;
  };
};

type YahooSplitEvent = { date: number; numerator: number; denominator: number; splitRatio: string };
type YahooDividendEvent = { date: number; amount: number };

type YahooChartResponse = {
  chart: {
    result: Array<{
      meta: YahooMeta;
      timestamp: number[];
      indicators: { quote: Array<{ open: number[]; high: number[]; low: number[]; close: number[]; volume: number[] }> };
      events?: {
        splits?: Record<string, YahooSplitEvent>;
        dividends?: Record<string, YahooDividendEvent>;
      };
    }>;
    error?: { code: string; description: string } | null;
  };
};

export type YahooCorporateAction =
  | { kind: 'split'; exDate: string; ratio: number; raw: string }
  | { kind: 'dividend'; exDate: string; amount: number };

const USER_AGENT = 'Mozilla/5.0 StockTracker/0.1';

function sessionFromPeriods(ts: number, meta: YahooMeta): Session {
  const periods = meta.tradingPeriods;
  if (periods) {
    const regular = periods.regular?.[0]?.[0];
    if (regular && ts >= regular.start && ts < regular.end) return 'regular';
    const pre = periods.pre?.[0]?.[0];
    if (pre && ts >= pre.start && ts < pre.end) return 'pre';
    const post = periods.post?.[0]?.[0];
    if (post && ts >= post.start && ts < post.end) return 'post';
  }
  return sessionFor(ts);
}

export class YahooProvider implements MarketDataProvider {
  readonly name = 'yahoo';

  async health(): Promise<ProviderHealth> {
    try {
      const r = await fetchWithTimeout('https://query1.finance.yahoo.com/v8/finance/chart/AAPL?range=1d&interval=1d', {
        headers: { 'User-Agent': USER_AGENT },
      }, TIMEOUT_QUOTE_MS);
      if (r.ok) return { status: 'ok' };
      if (r.status >= 500) return { status: 'degraded', message: `HTTP ${r.status}` };
      return { status: 'down', message: `HTTP ${r.status}` };
    } catch (e) {
      return { status: 'down', message: (e as Error).message };
    }
  }

  private async fetchChart(ticker: string, params: Record<string, string>): Promise<YahooChartResponse['chart']['result'][0] | null> {
    const search = new URLSearchParams(params);
    const r = await fetchWithTimeout(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker.toUpperCase())}?${search}`,
      { headers: { 'User-Agent': USER_AGENT } },
      TIMEOUT_BULK_MS,
    );
    if (r.status === 404 || r.status === 422) return null;
    if (!r.ok) throw new ProviderError(this.name, `chart HTTP ${r.status}`);
    const data = await r.json() as YahooChartResponse;
    if (data.chart.error) return null;
    return data.chart.result?.[0] ?? null;
  }

  /**
   * Fetch splits + dividends for a ticker over the past N years via Yahoo's
   * /v8/finance/chart events payload. Used by refresh-corporate-actions.
   */
  async getCorporateActions(ticker: string, years = 10): Promise<YahooCorporateAction[]> {
    const result = await this.fetchChart(ticker, {
      range: `${Math.min(20, Math.max(1, years))}y`,
      interval: '3mo',
      events: 'split,div',
    });
    if (!result || !result.events) return [];
    const out: YahooCorporateAction[] = [];
    const splits = result.events.splits ?? {};
    for (const [, ev] of Object.entries(splits)) {
      const ratio = ev.denominator > 0 ? ev.numerator / ev.denominator : 0;
      out.push({
        kind: 'split',
        exDate: new Date(ev.date * 1000).toISOString().slice(0, 10),
        ratio,
        raw: ev.splitRatio,
      });
    }
    const dividends = result.events.dividends ?? {};
    for (const [, ev] of Object.entries(dividends)) {
      out.push({
        kind: 'dividend',
        exDate: new Date(ev.date * 1000).toISOString().slice(0, 10),
        amount: ev.amount,
      });
    }
    return out;
  }

  async getLatestQuote(ticker: string): Promise<Quote | null> {
    const result = await this.fetchChart(ticker, { range: '1d', interval: '1d' });
    if (!result) return null;
    const meta = result.meta;
    return {
      ticker: meta.symbol,
      price: meta.regularMarketPrice,
      ts: meta.regularMarketTime,
      session: sessionFromPeriods(meta.regularMarketTime, meta),
    };
  }

  async getMinuteBars(ticker: string, opts: BarsOpts): Promise<Bar[]> {
    const result = await this.fetchChart(ticker, {
      period1: String(Math.floor(opts.start.getTime() / 1000)),
      period2: String(Math.floor(opts.end.getTime() / 1000)),
      interval: '1m',
      includePrePost: opts.prepost ? 'true' : 'false',
    });
    if (!result) return [];
    const q = result.indicators.quote[0];
    const bars: Bar[] = [];
    for (let i = 0; i < result.timestamp.length; i++) {
      const ts = result.timestamp[i];
      const open = q.open[i], high = q.high[i], low = q.low[i], close = q.close[i], volume = q.volume[i];
      if (open == null || close == null) continue;
      bars.push({
        ticker: ticker.toUpperCase(),
        ts,
        open, high, low, close,
        volume: volume ?? 0,
        session: sessionFromPeriods(ts, result.meta),
      });
    }
    return bars;
  }

  async getDailyBars(ticker: string, opts: { start: Date; end: Date }): Promise<Bar[]> {
    const result = await this.fetchChart(ticker, {
      period1: String(Math.floor(opts.start.getTime() / 1000)),
      period2: String(Math.floor(opts.end.getTime() / 1000)),
      interval: '1d',
    });
    if (!result) return [];
    const q = result.indicators.quote[0];
    const bars: Bar[] = [];
    for (let i = 0; i < result.timestamp.length; i++) {
      const ts = result.timestamp[i];
      const open = q.open[i], high = q.high[i], low = q.low[i], close = q.close[i], volume = q.volume[i];
      if (open == null || close == null) continue;
      bars.push({
        ticker: ticker.toUpperCase(),
        ts,
        open, high, low, close,
        volume: volume ?? 0,
        session: 'regular',
      });
    }
    return bars;
  }
}
