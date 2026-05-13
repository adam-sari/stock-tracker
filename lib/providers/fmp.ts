import { ProviderError } from './types';

export type FmpConfig = { apiKey: string; baseUrl?: string };

export type FmpProfile = {
  ticker: string;
  name: string;
  description?: string;
  sector?: string;
  industry?: string;
  exchange?: string;
  exchangeFullName?: string;
  country?: string;
  ceo?: string;
  employees?: number;
  ipoDate?: string;
  website?: string;
  marketCap?: number;
  beta?: number;
  cik?: string;
  isin?: string;
  cusip?: string;
  currency?: string;
};

export type FmpCongressTrade = {
  ticker: string;
  chamber: 'house' | 'senate';
  member: string;
  district: string;
  kind: string;
  amountLow: number;
  amountHigh: number;
  transactionDate: string;
  disclosureDate: string;
  ptrUrl: string;
};

export type FmpEarning = { symbol: string; date: string; epsActual: number | null; epsEstimate: number | null; revenueActual: number | null; revenueEstimate: number | null };
export type FmpDividend = { symbol: string; exDate: string; recordDate: string; paymentDate: string; declarationDate: string; dividend: number; yield: number; frequency: string };

/**
 * Parses Congress amount ranges like "$1,001 - $15,000".
 */
export function parseAmountRange(raw: string): { low: number; high: number } {
  const cleaned = raw.replace(/\$/g, '').replace(/,/g, '');
  const m = cleaned.match(/(\d+)\s*-\s*(\d+)/);
  if (m) return { low: Number(m[1]), high: Number(m[2]) };
  const single = cleaned.match(/(\d+)/);
  if (single) return { low: Number(single[1]), high: Number(single[1]) };
  return { low: 0, high: 0 };
}

export class FmpClient {
  private baseUrl: string;

  constructor(private cfg: FmpConfig) {
    this.baseUrl = cfg.baseUrl ?? 'https://financialmodelingprep.com/stable';
  }

  private async fetchJson<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set('apikey', this.cfg.apiKey);
    const r = await fetch(url);
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      throw new ProviderError('fmp', `${path} HTTP ${r.status} ${body.slice(0, 200)}`);
    }
    return r.json() as Promise<T>;
  }

  async getProfile(ticker: string): Promise<FmpProfile | null> {
    const arr = await this.fetchJson<Array<Record<string, unknown>>>('/profile', { symbol: ticker.toUpperCase() });
    const d = arr[0];
    if (!d) return null;
    return {
      ticker: String(d.symbol ?? ticker.toUpperCase()),
      name: String(d.companyName ?? ''),
      description: d.description as string,
      sector: d.sector as string,
      industry: d.industry as string,
      exchange: d.exchange as string,
      exchangeFullName: d.exchangeFullName as string,
      country: d.country as string,
      ceo: d.ceo as string,
      employees: d.employees ? Number(d.employees) : undefined,
      ipoDate: d.ipoDate as string,
      website: d.website as string,
      marketCap: d.marketCap as number,
      beta: d.beta as number,
      cik: d.cik as string,
      isin: d.isin as string,
      cusip: d.cusip as string,
      currency: d.currency as string,
    };
  }

  private parseCongressTrade(r: Record<string, unknown>, chamber: 'house' | 'senate'): FmpCongressTrade {
    const member = `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim() || String(r.office ?? '');
    const { low, high } = parseAmountRange(String(r.amount ?? ''));
    return {
      ticker: String(r.symbol ?? '').toUpperCase(),
      chamber,
      member,
      district: String(r.district ?? ''),
      kind: String(r.type ?? ''),
      amountLow: low,
      amountHigh: high,
      transactionDate: String(r.transactionDate ?? ''),
      disclosureDate: String(r.disclosureDate ?? ''),
      ptrUrl: String(r.link ?? ''),
    };
  }

  async getSenateLatest(): Promise<FmpCongressTrade[]> {
    const arr = await this.fetchJson<Array<Record<string, unknown>>>('/senate-latest');
    return arr.map(r => this.parseCongressTrade(r, 'senate'));
  }

  async getHouseLatest(): Promise<FmpCongressTrade[]> {
    const arr = await this.fetchJson<Array<Record<string, unknown>>>('/house-latest');
    return arr.map(r => this.parseCongressTrade(r, 'house'));
  }

  async getEarningsCalendar(): Promise<FmpEarning[]> {
    return this.fetchJson<FmpEarning[]>('/earnings-calendar');
  }

  async getDividends(ticker: string): Promise<FmpDividend[]> {
    const arr = await this.fetchJson<Array<Record<string, unknown>>>('/dividends', { symbol: ticker.toUpperCase() });
    return arr.map(r => ({
      symbol: String(r.symbol ?? ticker.toUpperCase()),
      exDate: String(r.date ?? ''),
      recordDate: String(r.recordDate ?? ''),
      paymentDate: String(r.paymentDate ?? ''),
      declarationDate: String(r.declarationDate ?? ''),
      dividend: Number(r.dividend ?? 0),
      yield: Number(r.yield ?? 0),
      frequency: String(r.frequency ?? ''),
    }));
  }
}
