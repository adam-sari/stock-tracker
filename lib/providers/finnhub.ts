import { TokenBucket } from '../rate-limit';
import { ProviderError } from './types';

export type FinnhubConfig = {
  apiKey: string;
  baseUrl?: string;
  // Defaults to 60 req/min — the documented free tier ceiling
  ratePerMin?: number;
};

export type FinnhubQuote = { price: number; change: number; changePct: number; high: number; low: number; open: number; previousClose: number; ts: number };
export type FinnhubNewsItem = { id: string; headline: string; url: string; source: string; summary: string; publishedAt: number; image?: string };
export type FinnhubProfile = { ticker: string; name: string; country?: string; currency?: string; exchange?: string; industry?: string; ipo?: string; marketCapMillions?: number; sharesOutstanding?: number; webUrl?: string; logoUrl?: string };
export type FinnhubInsiderTxn = { ticker: string; insiderName: string; code: string; shares: number; price?: number; isDerivative: boolean; txnDate: string; filingDate: string; filingId: string };
export type FinnhubInsiderSentimentMonth = { ticker: string; year: number; month: number; change: number; mspr: number };
export type FinnhubRecommendation = { ticker: string; period: string; strongBuy: number; buy: number; hold: number; sell: number; strongSell: number };
export type FinnhubEarning = { symbol: string; date: string; hour: string; epsActual: number | null; epsEstimate: number | null; revenueActual: number | null; revenueEstimate: number | null; quarter: number; year: number };
export type FinnhubFdaEvent = { ticker: string; companyName: string; fdaCommittee: string; eventDescription: string; eventDate: string };

export class FinnhubClient {
  private bucket: TokenBucket;
  private baseUrl: string;

  constructor(private cfg: FinnhubConfig) {
    this.baseUrl = cfg.baseUrl ?? 'https://finnhub.io/api/v1';
    const rpm = cfg.ratePerMin ?? 60;
    this.bucket = new TokenBucket({ capacity: rpm, refillPerMs: rpm / 60_000 });
  }

  private async fetchJson(path: string, params: Record<string, string> = {}): Promise<unknown> {
    await this.bucket.acquire();
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set('token', this.cfg.apiKey);
    const r = await fetch(url);
    if (!r.ok) throw new ProviderError('finnhub', `${path} HTTP ${r.status}`);
    return r.json();
  }

  async getQuote(ticker: string): Promise<FinnhubQuote> {
    const d = await this.fetchJson('/quote', { symbol: ticker.toUpperCase() }) as { c: number; d: number; dp: number; h: number; l: number; o: number; pc: number; t: number };
    return { price: d.c, change: d.d, changePct: d.dp, high: d.h, low: d.l, open: d.o, previousClose: d.pc, ts: d.t };
  }

  async getCompanyNews(ticker: string, from: Date, to: Date): Promise<FinnhubNewsItem[]> {
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const arr = await this.fetchJson('/company-news', { symbol: ticker.toUpperCase(), from: fmt(from), to: fmt(to) }) as Array<{ id: number; headline: string; url: string; source: string; summary: string; datetime: number; image?: string }>;
    return arr.map(a => ({ id: String(a.id), headline: a.headline, url: a.url, source: a.source, summary: a.summary, publishedAt: a.datetime, image: a.image || undefined }));
  }

  async getProfile(ticker: string): Promise<FinnhubProfile | null> {
    const d = await this.fetchJson('/stock/profile2', { symbol: ticker.toUpperCase() }) as Record<string, unknown>;
    if (!d || Object.keys(d).length === 0) return null;
    return {
      ticker: String(d.ticker ?? ticker.toUpperCase()),
      name: String(d.name ?? ''),
      country: d.country as string,
      currency: d.currency as string,
      exchange: d.exchange as string,
      industry: d.finnhubIndustry as string,
      ipo: d.ipo as string,
      marketCapMillions: d.marketCapitalization as number,
      sharesOutstanding: d.shareOutstanding as number,
      webUrl: d.weburl as string,
      logoUrl: d.logo as string,
    };
  }

  async getInsiderTransactions(ticker: string): Promise<FinnhubInsiderTxn[]> {
    const d = await this.fetchJson('/stock/insider-transactions', { symbol: ticker.toUpperCase() }) as { data?: Array<{ change: number; filingDate: string; id: string; isDerivative: boolean; name: string; share: number; symbol: string; transactionCode: string; transactionDate: string; transactionPrice: number }> };
    return (d.data ?? []).map(r => ({
      ticker: r.symbol,
      insiderName: r.name,
      code: r.transactionCode,
      shares: r.change,
      price: r.transactionPrice || undefined,
      isDerivative: r.isDerivative,
      txnDate: r.transactionDate,
      filingDate: r.filingDate,
      filingId: r.id,
    }));
  }

  async getInsiderSentiment(ticker: string, from: Date, to: Date): Promise<FinnhubInsiderSentimentMonth[]> {
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const d = await this.fetchJson('/stock/insider-sentiment', { symbol: ticker.toUpperCase(), from: fmt(from), to: fmt(to) }) as { data?: Array<{ symbol: string; year: number; month: number; change: number; mspr: number }> };
    return (d.data ?? []).map(r => ({ ticker: r.symbol, year: r.year, month: r.month, change: r.change, mspr: r.mspr }));
  }

  async getRecommendation(ticker: string): Promise<FinnhubRecommendation[]> {
    const arr = await this.fetchJson('/stock/recommendation', { symbol: ticker.toUpperCase() }) as Array<{ symbol: string; period: string; strongBuy: number; buy: number; hold: number; sell: number; strongSell: number }>;
    return arr.map(r => ({ ticker: r.symbol, period: r.period, strongBuy: r.strongBuy, buy: r.buy, hold: r.hold, sell: r.sell, strongSell: r.strongSell }));
  }

  async getEarningsCalendar(from: Date, to: Date): Promise<FinnhubEarning[]> {
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const d = await this.fetchJson('/calendar/earnings', { from: fmt(from), to: fmt(to) }) as { earningsCalendar?: FinnhubEarning[] };
    return d.earningsCalendar ?? [];
  }

  /**
   * FDA advisory committee calendar.
   * NOTE: As of mid-2026 this endpoint may be restricted to paid tiers.
   * Returns an empty array on 403 rather than throwing, so callers can
   * handle gracefully. The caller should check for a null result to detect
   * the paid-gate scenario.
   */
  async getFdaCalendar(): Promise<FinnhubFdaEvent[] | null> {
    await this.bucket.acquire();
    const url = new URL(this.baseUrl + '/fda-advisory-committee-calendar');
    url.searchParams.set('token', this.cfg.apiKey);
    const r = await fetch(url);
    // 403 = paid-tier gate; return null to signal this to callers
    if (r.status === 403) return null;
    if (!r.ok) throw new ProviderError('finnhub', `/fda-advisory-committee-calendar HTTP ${r.status}`);
    const arr = (await r.json()) as Array<{
      ticker?: string;
      companyName?: string;
      fdaCommittee?: string;
      eventDescription?: string;
      eventDate?: string;
    }>;
    return arr.map(a => ({
      ticker: a.ticker ?? '',
      companyName: a.companyName ?? '',
      fdaCommittee: a.fdaCommittee ?? '',
      eventDescription: a.eventDescription ?? '',
      eventDate: a.eventDate ?? '',
    }));
  }
}
