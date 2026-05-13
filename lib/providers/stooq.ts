import type { MarketDataProvider, Quote, Bar, BarsOpts, ProviderHealth } from './types';
import { ProviderError } from './types';

export class StooqProvider implements MarketDataProvider {
  readonly name = 'stooq';

  async health(): Promise<ProviderHealth> {
    try {
      const r = await fetch('https://stooq.com/q/d/l/?s=aapl.us&i=d&d1=20260101&d2=20260102');
      return r.ok ? { status: 'ok' } : { status: 'degraded', message: `HTTP ${r.status}` };
    } catch (e) {
      return { status: 'down', message: (e as Error).message };
    }
  }

  async getLatestQuote(_: string): Promise<Quote | null> {
    return null;
  }

  async getMinuteBars(_: string, __: BarsOpts): Promise<Bar[]> {
    return [];
  }

  async getDailyBars(ticker: string, opts: { start: Date; end: Date }): Promise<Bar[]> {
    const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');
    const symbol = `${ticker.toLowerCase()}.us`;
    const url = `https://stooq.com/q/d/l/?s=${symbol}&i=d&d1=${fmt(opts.start)}&d2=${fmt(opts.end)}`;
    const r = await fetch(url);
    if (!r.ok) throw new ProviderError(this.name, `HTTP ${r.status}`);
    const text = (await r.text()).trim();
    if (text === 'No data' || !text.includes(',')) return [];

    const lines = text.split('\n');
    return lines.slice(1).filter(l => l.length > 0).map(line => {
      const [date, open, high, low, close, volume] = line.split(',');
      return {
        ticker: ticker.toUpperCase(),
        ts: Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 1000),
        open: parseFloat(open),
        high: parseFloat(high),
        low: parseFloat(low),
        close: parseFloat(close),
        volume: parseFloat(volume),
        session: 'regular' as const,
      };
    });
  }
}
