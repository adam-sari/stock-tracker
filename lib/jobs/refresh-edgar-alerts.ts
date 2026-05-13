import { getDb } from '../db/connection';
import { listHoldings } from '../db/queries/holdings';
import { upsertEdgarAlert } from '../db/queries/edgar-alerts';
import {
  searchFullText,
  loadCikTickerMap,
  filingUrl,
  type CikTickerMap,
} from '../providers/sec-edgar';

const PHRASES = ['going concern', 'material adverse change', 'restatement'];

/** How many days back to search EDGAR for each run */
const LOOKBACK_DAYS = 7;

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function subtractDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setUTCDate(copy.getUTCDate() - n);
  return copy;
}

export async function refreshEdgarAlertsOnce(opts: {
  /** Override SEC base URL for tests */
  eftsBaseUrl?: string;
  secBaseUrl?: string;
} = {}): Promise<{ phrases: number; hits: number; stored: number }> {
  const db = getDb();
  const started = Math.floor(Date.now() / 1000);
  const jobRow = db
    .prepare(`INSERT INTO job_runs (job, started_at, status) VALUES ('refresh_edgar_alerts', ?, 'running')`)
    .run(started);

  let totalHits = 0;
  let stored = 0;
  let error: string | null = null;

  try {
    // Build universe of held + watched tickers
    const holdings = listHoldings();
    const watchRows = db.prepare(`SELECT ticker FROM watchlist`).all() as Array<{ ticker: string }>;
    const universe = new Set<string>([
      ...holdings.map(h => h.ticker.toUpperCase()),
      ...watchRows.map(w => w.ticker.toUpperCase()),
    ]);

    if (universe.size === 0) {
      db.prepare(`UPDATE job_runs SET finished_at=?, status=?, detail=? WHERE id=?`)
        .run(Math.floor(Date.now() / 1000), 'ok', 'no tickers in universe', jobRow.lastInsertRowid);
      return { phrases: PHRASES.length, hits: 0, stored: 0 };
    }

    // Load CIK→ticker map (cached on disk for 7 days)
    let cikMap: CikTickerMap;
    try {
      cikMap = await loadCikTickerMap(opts.secBaseUrl);
    } catch (e) {
      console.warn('[refresh-edgar-alerts] Failed to load CIK→ticker map:', (e as Error).message);
      cikMap = new Map();
    }

    const now = new Date();
    const toDate = toDateStr(now);
    const fromDate = toDateStr(subtractDays(now, LOOKBACK_DAYS));

    for (const phrase of PHRASES) {
      let hits: Awaited<ReturnType<typeof searchFullText>>;
      try {
        hits = await searchFullText(phrase, fromDate, toDate, '10-K,10-Q', 10, opts.eftsBaseUrl);
      } catch (e) {
        console.warn(`[refresh-edgar-alerts] EDGAR search failed for phrase="${phrase}":`, (e as Error).message);
        continue;
      }

      totalHits += hits.length;

      for (const hit of hits) {
        // Map CIK → ticker
        const ticker = cikMap.get(hit.cik);
        if (!ticker) continue; // Can't correlate to a ticker

        // Filter to held + watched universe
        if (!universe.has(ticker)) continue;

        const url = filingUrl(hit.accession_no);
        try {
          upsertEdgarAlert({
            ticker,
            phrase,
            filing_url: url,
            filing_date: hit.file_date,
            snippet: hit.snippet.slice(0, 500),
            fetched_at: started,
          });
          stored++;
        } catch (e) {
          console.warn(`[refresh-edgar-alerts] Failed to store alert ticker=${ticker} phrase="${phrase}":`, (e as Error).message);
        }
      }
    }
  } catch (e) {
    error = (e as Error).message;
    console.error('[refresh-edgar-alerts] fatal error:', error);
  }

  db.prepare(`UPDATE job_runs SET finished_at=?, status=?, detail=? WHERE id=?`)
    .run(
      Math.floor(Date.now() / 1000),
      error ? 'error' : 'ok',
      error ?? `phrases=${PHRASES.length} hits=${totalHits} stored=${stored}`,
      jobRow.lastInsertRowid,
    );

  return { phrases: PHRASES.length, hits: totalHits, stored };
}
