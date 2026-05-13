/**
 * Minimal SEC EDGAR client.
 * Full-text search: https://efts.sec.gov/LATEST/search-index
 * Company tickers: https://www.sec.gov/files/company_tickers.json
 *
 * Per SEC policy, all requests must include a User-Agent header with contact info.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const USER_AGENT = 'StockTracker/1.0 (https://github.com/stocktracker; contact@example.com)';

export type EdgarHit = {
  /** Entity name as returned by EDGAR */
  entity_name: string;
  /** CIK (Central Index Key) string, zero-padded to 10 digits */
  cik: string;
  /** Accession number in the form XXXXXXXXXX-YY-ZZZZZZ */
  accession_no: string;
  /** Form type e.g. "10-K", "10-Q" */
  file_date: string;
  /** Short snippet from the filing text */
  snippet: string;
};

export type EdgarSearchResponse = {
  hits: {
    total: { value: number };
    hits: Array<{
      _source: {
        entity_name: string;
        cik: string;
        accession_no: string;
        file_date: string;
        form_type: string;
      };
      highlight?: {
        file_text?: string[];
      };
    }>;
  };
};

/** Raw shape from https://www.sec.gov/files/company_tickers.json */
type CompanyTickerEntry = {
  cik_str: number;
  ticker: string;
  title: string;
};

/** Map from CIK string (zero-padded 10 digits) → ticker symbol */
export type CikTickerMap = Map<string, string>;

const CACHE_DIR = path.join(process.cwd(), 'db');
const CIK_CACHE_PATH = path.join(CACHE_DIR, 'company_tickers.json');
const CIK_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

type CikCacheFile = {
  fetchedAt: number;
  /** cik (10-digit string) → ticker */
  map: Record<string, string>;
};

/**
 * Load the CIK→ticker map from local cache (if fresh) or fetch from SEC.
 * Cache lifetime: 7 days.
 */
export async function loadCikTickerMap(baseUrl = 'https://www.sec.gov'): Promise<CikTickerMap> {
  // Try disk cache
  if (existsSync(CIK_CACHE_PATH)) {
    try {
      const raw = JSON.parse(readFileSync(CIK_CACHE_PATH, 'utf8')) as CikCacheFile;
      if (Date.now() - raw.fetchedAt < CIK_CACHE_TTL_MS) {
        return new Map(Object.entries(raw.map));
      }
    } catch {
      // Corrupt cache — fall through to re-fetch
    }
  }

  // Fetch from SEC
  const url = `${baseUrl}/files/company_tickers.json`;
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!res.ok) throw new Error(`SEC company_tickers fetch failed: HTTP ${res.status}`);

  const body = await res.json() as Record<string, CompanyTickerEntry>;
  const entries = Object.values(body);
  const map: Record<string, string> = {};
  for (const entry of entries) {
    const cik = String(entry.cik_str).padStart(10, '0');
    map[cik] = entry.ticker.toUpperCase();
  }

  // Persist to cache
  mkdirSync(CACHE_DIR, { recursive: true });
  const cacheFile: CikCacheFile = { fetchedAt: Date.now(), map };
  writeFileSync(CIK_CACHE_PATH, JSON.stringify(cacheFile));

  return new Map(Object.entries(map));
}

/**
 * Search EDGAR full-text for a phrase within a date range.
 * Returns up to `size` hits.
 */
export async function searchFullText(
  phrase: string,
  fromDate: string, // YYYY-MM-DD
  toDate: string,   // YYYY-MM-DD
  forms = '10-K,10-Q',
  size = 10,
  baseUrl = 'https://efts.sec.gov',
): Promise<EdgarHit[]> {
  const params = new URLSearchParams({
    q: `"${phrase}"`,
    forms,
    dateRange: 'custom',
    startdt: fromDate,
    enddt: toDate,
    _source: 'entity_name,cik,accession_no,file_date,form_type',
    hits_per_page: String(size),
  });

  const url = `${baseUrl}/LATEST/search-index?${params.toString()}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!res.ok) throw new Error(`EDGAR full-text search failed: HTTP ${res.status} for phrase="${phrase}"`);

  const body = await res.json() as EdgarSearchResponse;
  const rawHits = body?.hits?.hits ?? [];

  return rawHits.map(h => {
    const snippets = h.highlight?.file_text ?? [];
    return {
      entity_name: h._source.entity_name ?? '',
      cik: String(h._source.cik).padStart(10, '0'),
      accession_no: h._source.accession_no ?? '',
      file_date: h._source.file_date ?? '',
      snippet: snippets[0] ?? '',
    };
  });
}

/** Build the URL to view a filing on EDGAR */
export function filingUrl(accessionNo: string): string {
  const noHyphens = accessionNo.replace(/-/g, '');
  const cik = noHyphens.slice(0, 10).replace(/^0+/, '');
  return `https://www.sec.gov/Archives/edgar/${noHyphens.slice(0, 2)}-${noHyphens.slice(2, 4)}/${noHyphens}/${accessionNo}-index.htm`;
}
