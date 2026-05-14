import type { MarketDataProvider, Quote, Bar, BarsOpts, ProviderHealth } from './types';
import { ProviderError } from './types';
import { sessionFor } from './session';
import { fetchWithTimeout, TIMEOUT_QUOTE_MS, TIMEOUT_BULK_MS } from './fetch-timeout';

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
      const r = await fetchWithTimeout(`${this.baseUrl}/account`, { headers: this.headers }, TIMEOUT_QUOTE_MS);
      if (r.status === 200) return { status: 'ok' };
      if (r.status === 401) return { status: 'down', message: 'auth failed' };
      return { status: 'degraded', message: `HTTP ${r.status}` };
    } catch (e) {
      return { status: 'down', message: (e as Error).message };
    }
  }

  async getLatestQuote(ticker: string): Promise<Quote | null> {
    // Use Alpaca's snapshot endpoint: returns latestTrade + latestQuote + bars in one call.
    // We prefer the latestTrade price over the bid/ask midpoint because IEX's free quote
    // feed can be stale (e.g. bid present but ask=0 in post-market), giving a wrong price.
    // The trade price is the actual most-recent printed trade on IEX.
    const upper = ticker.toUpperCase();
    const r = await fetchWithTimeout(`${this.dataBaseUrl}/v2/stocks/snapshots?symbols=${upper}`, { headers: this.headers }, TIMEOUT_QUOTE_MS);
    if (r.status === 404) return null;
    if (!r.ok) throw new ProviderError(this.name, `snapshots HTTP ${r.status}`);
    const data = await r.json() as Record<string, {
      latestQuote?: { ap: number; as: number; bp: number; bs: number; t: string };
      latestTrade?: { p: number; s: number; t: string };
      minuteBar?: { c: number; t: string };
      dailyBar?: { c: number; t: string };
    }>;
    const snap = data[upper];
    if (!snap) return null;

    const trade = snap.latestTrade;
    const quote = snap.latestQuote;
    const minute = snap.minuteBar;
    const daily = snap.dailyBar;

    // Prefer freshest reliable price source:
    // 1. latestTrade (real print, most accurate)
    // 2. minuteBar.close (last completed minute)
    // 3. bid/ask midpoint if both sides exist
    // 4. whichever side of the quote exists, else dailyBar.close
    let price: number | undefined;
    let ts: Date | undefined;
    if (trade && trade.p > 0) {
      price = trade.p;
      ts = new Date(trade.t);
    } else if (minute && minute.c > 0) {
      price = minute.c;
      ts = new Date(minute.t);
    } else if (quote && quote.bp > 0 && quote.ap > 0) {
      price = (quote.bp + quote.ap) / 2;
      ts = new Date(quote.t);
    } else if (quote && (quote.bp > 0 || quote.ap > 0)) {
      price = quote.ap || quote.bp;
      ts = new Date(quote.t);
    } else if (daily && daily.c > 0) {
      price = daily.c;
      ts = new Date(daily.t);
    } else {
      return null;
    }

    return {
      ticker: upper,
      price,
      bid: quote?.bp || undefined,
      ask: quote?.ap || undefined,
      bidSize: quote?.bs,
      askSize: quote?.as,
      ts: Math.floor((ts ?? new Date()).getTime() / 1000),
      session: sessionFor(ts ?? new Date()),
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
    const r = await fetchWithTimeout(`${this.dataBaseUrl}/v2/stocks/${ticker.toUpperCase()}/bars?${params}`, { headers: this.headers }, TIMEOUT_BULK_MS);
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
    const r = await fetchWithTimeout(`${this.dataBaseUrl}/v2/stocks/${ticker.toUpperCase()}/bars?${params}`, { headers: this.headers }, TIMEOUT_BULK_MS);
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
