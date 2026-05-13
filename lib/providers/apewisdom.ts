import { ProviderError } from './types';

export type ApewisdomEntry = {
  ticker: string;
  name: string;
  rank: number;
  mentions: number;
  upvotes: number;
  rank24hAgo: number;
  mentions24hAgo: number;
};

export type ApewisdomConfig = { baseUrl?: string };

export class ApewisdomClient {
  private baseUrl: string;
  constructor(cfg: ApewisdomConfig = {}) {
    this.baseUrl = cfg.baseUrl ?? 'https://apewisdom.io/api/v1.0';
  }

  async getTopStocks(page = 1): Promise<ApewisdomEntry[]> {
    const url = `${this.baseUrl}/filter/all-stocks/page/${page}`;
    const r = await fetch(url);
    if (!r.ok) throw new ProviderError('apewisdom', `HTTP ${r.status}`);
    const body = await r.json() as { results: Array<{ rank: number; ticker: string; name: string; mentions: number; upvotes: number; rank_24h_ago: number; mentions_24h_ago: number }> };
    return body.results.map(r => ({
      ticker: r.ticker,
      name: r.name,
      rank: r.rank,
      mentions: r.mentions,
      upvotes: r.upvotes,
      rank24hAgo: r.rank_24h_ago,
      mentions24hAgo: r.mentions_24h_ago,
    }));
  }

  async getForTickers(tickers: string[]): Promise<ApewisdomEntry[]> {
    const universe = new Set(tickers.map(t => t.toUpperCase()));
    const top = await this.getTopStocks(1);
    return top.filter(t => universe.has(t.ticker.toUpperCase()));
  }
}
