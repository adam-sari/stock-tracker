import type { MarketDataProvider, Quote, Bar, BarsOpts, ProviderHealth } from './types';
import { sessionFor } from './session';

export type MockConfig = {
  basePrices?: Record<string, number>;
  volatility?: number;
};

export class MockProvider implements MarketDataProvider {
  readonly name = 'mock';
  private prices: Record<string, number>;
  private volatility: number;

  constructor(cfg: MockConfig = {}) {
    this.prices = cfg.basePrices ?? {};
    this.volatility = cfg.volatility ?? 0.5;
  }

  async health(): Promise<ProviderHealth> {
    return { status: 'ok' };
  }

  async getLatestQuote(ticker: string): Promise<Quote | null> {
    const base = this.prices[ticker.toUpperCase()];
    if (base === undefined) return null;
    const now = new Date();
    return {
      ticker: ticker.toUpperCase(),
      price: base,
      bid: base - 0.01,
      ask: base + 0.01,
      ts: Math.floor(now.getTime() / 1000),
      session: sessionFor(now),
    };
  }

  async getMinuteBars(ticker: string, opts: BarsOpts): Promise<Bar[]> {
    const base = this.prices[ticker.toUpperCase()];
    if (base === undefined) return [];
    const bars: Bar[] = [];
    const startMs = opts.start.getTime();
    const endMs = opts.end.getTime();
    let price = base;
    for (let t = startMs; t < endMs; t += 60_000) {
      const ts = new Date(t);
      const session = sessionFor(ts);
      if (!opts.prepost && session !== 'regular') continue;
      const drift = (Math.sin(t / 1e7) * this.volatility);
      const open = price;
      const close = price + drift;
      const high = Math.max(open, close) + Math.abs(drift) * 0.5;
      const low = Math.min(open, close) - Math.abs(drift) * 0.5;
      bars.push({
        ticker: ticker.toUpperCase(),
        ts: Math.floor(t / 1000),
        open, high, low, close,
        volume: 1000 + Math.floor(Math.abs(drift) * 100),
        session,
      });
      price = close;
    }
    return bars;
  }

  async getDailyBars(ticker: string, opts: { start: Date; end: Date }): Promise<Bar[]> {
    const base = this.prices[ticker.toUpperCase()];
    if (base === undefined) return [];
    const bars: Bar[] = [];
    const day = 86400_000;
    const startMs = opts.start.getTime();
    const endMs = opts.end.getTime();
    let price = base;
    for (let t = startMs; t < endMs; t += day) {
      const drift = Math.sin(t / 1e9) * this.volatility * 4;
      const open = price;
      const close = price + drift;
      bars.push({
        ticker: ticker.toUpperCase(),
        ts: Math.floor(t / 1000),
        open,
        high: Math.max(open, close) + Math.abs(drift),
        low: Math.min(open, close) - Math.abs(drift),
        close,
        volume: 1_000_000,
        session: 'regular',
      });
      price = close;
    }
    return bars;
  }
}
