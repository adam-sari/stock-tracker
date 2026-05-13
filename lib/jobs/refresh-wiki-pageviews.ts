import { getDb } from '../db/connection';
import { listHoldings } from '../db/queries/holdings';
import { upsertWikiPageviews } from '../db/queries/wiki-pageviews';
import { getStockMeta } from '../db/queries/stock-meta';
import { WikimediaClient } from '../providers/wikimedia';

/**
 * Hardcoded fallback mapping from ticker to Wikipedia article title.
 * Used when stock_meta.name is unavailable or unlikely to match well.
 */
const TICKER_TO_ARTICLE: Record<string, string> = {
  AAPL: 'Apple_Inc.',
  NVDA: 'Nvidia',
  MSFT: 'Microsoft',
  TSLA: 'Tesla,_Inc.',
  META: 'Meta_Platforms',
  GOOGL: 'Alphabet_Inc.',
  GOOG: 'Alphabet_Inc.',
  AMZN: 'Amazon_(company)',
};

/**
 * Resolve the Wikipedia article title for a ticker.
 * Priority: hardcoded map → stock_meta.name (spaces replaced with underscores) → ticker itself.
 */
export function resolveArticle(ticker: string): string {
  const upper = ticker.toUpperCase();
  if (TICKER_TO_ARTICLE[upper]) return TICKER_TO_ARTICLE[upper];
  const meta = getStockMeta(upper);
  if (meta?.name) return meta.name.replace(/ /g, '_');
  return upper;
}

export async function refreshWikiPageviewsOnce(
  client: WikimediaClient = new WikimediaClient(),
): Promise<{ tickers: number; rows: number }> {
  const db = getDb();
  const started = Math.floor(Date.now() / 1000);
  const job = db.prepare(`INSERT INTO job_runs (job, started_at, status) VALUES ('refresh_wiki_pageviews', ?, 'running')`).run(started);

  let totalRows = 0;
  let error: string | null = null;

  try {
    // Build universe: held + watched tickers
    const holdings = listHoldings();
    const watch = db.prepare(`SELECT ticker FROM watchlist`).all() as Array<{ ticker: string }>;
    const universe = [...new Set([
      ...holdings.map(h => h.ticker.toUpperCase()),
      ...watch.map(w => w.ticker.toUpperCase()),
    ])];

    // Date range: last 30 days
    const now = new Date();
    const end = new Date(now);
    end.setUTCDate(end.getUTCDate() - 1); // yesterday (today may be incomplete)
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 29); // 30 days total

    const startStr = WikimediaClient.formatDate(start);
    const endStr = WikimediaClient.formatDate(end);

    for (const ticker of universe) {
      const article = resolveArticle(ticker);
      try {
        const items = await client.getPageviews(article, startStr, endStr);
        const rows = items.map(it => ({
          ticker,
          date: WikimediaClient.parseTimestamp(it.timestamp),
          views: it.views,
        }));
        upsertWikiPageviews(rows);
        totalRows += rows.length;
      } catch (e) {
        // Log but don't abort — one bad ticker shouldn't stop the rest
        console.warn(`[refresh-wiki-pageviews] failed for ${ticker} (article=${article}):`, (e as Error).message);
      }
    }
  } catch (e) {
    error = (e as Error).message;
  }

  db.prepare(`UPDATE job_runs SET finished_at=?, status=?, detail=? WHERE id=?`)
    .run(Math.floor(Date.now() / 1000), error ? 'error' : 'ok', error ?? `rows=${totalRows}`, job.lastInsertRowid);

  return { tickers: 0, rows: totalRows };
}
