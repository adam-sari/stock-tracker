import { ProviderError } from './types';

export type WikiPageviewItem = {
  article: string;
  timestamp: string; // "2026050600"
  views: number;
};

export type WikiPageviewsResponse = {
  items: Array<{
    project: string;
    article: string;
    timestamp: string;
    views: number;
  }>;
};

export type WikimediaConfig = {
  baseUrl?: string;
  userAgent?: string;
};

/** Client for the Wikimedia REST API pageviews endpoint — no auth required. */
export class WikimediaClient {
  private baseUrl: string;
  private userAgent: string;

  constructor(cfg: WikimediaConfig = {}) {
    this.baseUrl = cfg.baseUrl ?? 'https://wikimedia.org/api/rest_v1';
    this.userAgent = cfg.userAgent ?? 'StockTracker/1.0 (https://github.com/stocktracker; contact@example.com)';
  }

  /**
   * Fetch daily pageviews for an article between start and end (inclusive).
   * Dates are YYYYMMDD strings (no separators).
   */
  async getPageviews(article: string, startDate: string, endDate: string): Promise<WikiPageviewItem[]> {
    const url = `${this.baseUrl}/metrics/pageviews/per-article/en.wikipedia.org/all-access/all-agents/${encodeURIComponent(article)}/daily/${startDate}/${endDate}`;
    const r = await fetch(url, {
      headers: { 'User-Agent': this.userAgent },
    });
    if (r.status === 404) return []; // article not found → treat as no data
    if (!r.ok) throw new ProviderError('wikimedia', `HTTP ${r.status} for article=${article}`);
    const body = await r.json() as WikiPageviewsResponse;
    return (body.items ?? []).map(it => ({
      article: it.article,
      timestamp: it.timestamp,
      views: it.views,
    }));
  }

  /**
   * Parse a Wikimedia timestamp string (e.g. "2026050600") into a YYYY-MM-DD date string.
   */
  static parseTimestamp(ts: string): string {
    // Format: YYYYMMDDhh — take first 8 chars
    const d = ts.slice(0, 8);
    return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  }

  /**
   * Format a Date as YYYYMMDD for use in the API URL.
   */
  static formatDate(d: Date): string {
    const y = d.getUTCFullYear().toString().padStart(4, '0');
    const m = (d.getUTCMonth() + 1).toString().padStart(2, '0');
    const day = d.getUTCDate().toString().padStart(2, '0');
    return `${y}${m}${day}`;
  }
}
