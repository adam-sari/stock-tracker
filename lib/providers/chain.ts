import type { MarketDataProvider, Quote, Bar, BarsOpts, ProviderHealth } from './types';
import { recordProviderSuccess, recordProviderFailure } from '../db/queries/health';

type ChainCall<T> = (p: MarketDataProvider) => Promise<T>;

export class ProviderChain {
  constructor(private providers: MarketDataProvider[]) {}

  async getLatestQuote(ticker: string): Promise<Quote | null> {
    return this.runChain('getLatestQuote', p => p.getLatestQuote(ticker));
  }

  async getMinuteBars(ticker: string, opts: BarsOpts): Promise<Bar[]> {
    const v = await this.runChain<Bar[] | null>('getMinuteBars', async p => {
      const r = await p.getMinuteBars(ticker, opts);
      return r.length > 0 ? r : null;
    });
    return v ?? [];
  }

  async getDailyBars(ticker: string, opts: { start: Date; end: Date }): Promise<Bar[]> {
    const v = await this.runChain<Bar[] | null>('getDailyBars', async p => {
      const r = await p.getDailyBars(ticker, opts);
      return r.length > 0 ? r : null;
    });
    return v ?? [];
  }

  async healthCheckAll(): Promise<Record<string, ProviderHealth>> {
    const out: Record<string, ProviderHealth> = {};
    for (const p of this.providers) {
      out[p.name] = await p.health();
    }
    return out;
  }

  private async runChain<T>(method: string, call: ChainCall<T | null>): Promise<T | null> {
    for (const p of this.providers) {
      try {
        const result = await call(p);
        if (result === null) continue;
        recordProviderSuccess(p.name);
        return result;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        recordProviderFailure(p.name, `${method}: ${msg}`);
        continue;
      }
    }
    return null;
  }
}
