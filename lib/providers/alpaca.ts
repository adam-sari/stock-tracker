import type { MarketDataProvider, Quote, Bar, BarsOpts, ProviderHealth } from './types';
import { ProviderError } from './types';
import { sessionFor } from './session';

export type AlpacaConfig = {
  keyId: string;
  secret: string;
  baseUrl?: string;
  dataBaseUrl?: string;
};

export class AlpacaProvider implements MarketDataProvider {
  readonly name = 'alpaca';
  private headers: HeadersInit;
  private baseUrl: string;
  private dataBaseUrl: string;

  constructor(cfg: AlpacaConfig) {
    this.headers = {
      'APCA-API-KEY-ID': cfg.keyId,
      'APCA-API-SECRET-KEY': cfg.secret,
    };
    this.baseUrl = cfg.baseUrl ?? 'https://paper-api.alpaca.markets/v2';
    this.dataBaseUrl = cfg.dataBaseUrl ?? 'https://data.alpaca.markets';
  }

  async health(): Promise<ProviderHealth> {
    try {
      const r = await fetch(`${this.baseUrl}/account`, { headers: this.headers });
      if (r.status === 200) return { status: 'ok' };
      if (r.status === 401) return { status: 'down', message: 'auth failed' };
      return { status: 'degraded', message: `HTTP ${r.status}` };
    } catch (e) {
      return { status: 'down', message: (e as Error).message };
    }
  }

  async getLatestQuote(ticker: string): Promise<Quote | null> {
    const r = await fetch(`${this.dataBaseUrl}/v2/stocks/${ticker.toUpperCase()}/quotes/latest`, { headers: this.headers });
    if (r.status === 404) return null;
    if (!r.ok) throw new ProviderError(this.name, `quote HTTP ${r.status}`);
    const data = await r.json() as { quote?: { ap: number; as: number; bp: number; bs: number; t: string }; symbol: string };
    if (!data.quote) return null;
    const q = data.quote;
    const ts = new Date(q.t);
    const bid = q.bp;
    const ask = q.ap;
    const price = (bid && ask) ? (bid + ask) / 2 : (ask || bid);
    return {
      ticker: data.symbol,
      price,
      bid,
      ask,
      bidSize: q.bs,
      askSize: q.as,
      ts: Math.floor(ts.getTime() / 1000),
      session: sessionFor(ts),
    };
  }

  async getMinuteBars(ticker: string, opts: BarsOpts): Promise<Bar[]> {
    const params = new URLSearchParams({
      timeframe: '1Min',
      start: opts.start.toISOString(),
      end: opts.end.toISOString(),
      limit: '10000',
      adjustment: 'all',
    });
    const r = await fetch(`${this.dataBaseUrl}/v2/stocks/${ticker.toUpperCase()}/bars?${params}`, { headers: this.headers });
    if (r.status === 404) return [];
    if (!r.ok) throw new ProviderError(this.name, `bars HTTP ${r.status}`);
    const data = await r.json() as { bars?: Array<{ t: string; o: number; h: number; l: number; c: number; v: number }> };
    if (!data.bars) return [];
    return data.bars.map(b => {
      const ts = new Date(b.t);
      return {
        ticker: ticker.toUpperCase(),
        ts: Math.floor(ts.getTime() / 1000),
        open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v,
        session: sessionFor(ts),
      };
    });
  }

  async getDailyBars(ticker: string, opts: { start: Date; end: Date }): Promise<Bar[]> {
    const params = new URLSearchParams({
      timeframe: '1Day',
      start: opts.start.toISOString(),
      end: opts.end.toISOString(),
      limit: '10000',
      adjustment: 'all',
    });
    const r = await fetch(`${this.dataBaseUrl}/v2/stocks/${ticker.toUpperCase()}/bars?${params}`, { headers: this.headers });
    if (r.status === 404) return [];
    if (!r.ok) throw new ProviderError(this.name, `daily bars HTTP ${r.status}`);
    const data = await r.json() as { bars?: Array<{ t: string; o: number; h: number; l: number; c: number; v: number }> };
    if (!data.bars) return [];
    return data.bars.map(b => ({
      ticker: ticker.toUpperCase(),
      ts: Math.floor(new Date(b.t).getTime() / 1000),
      open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v,
      session: 'regular',
    }));
  }
}
