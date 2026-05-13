import { getDb } from '../connection';

export type ActivityEvent = {
  ts: number;                              // sort key, epoch seconds
  kind: 'news' | 'insider' | 'congress' | 'fund' | 'sentiment' | 'halt';
  ticker: string;
  title: string;
  detail: string;
  link?: string;
  source: string;
};

/**
 * Unified chronological feed of all signals for one ticker.
 *
 * Strategy: one SQL query per source converted to the ActivityEvent shape,
 * UNION ALL'd together, sorted in SQL. For ~50 events per source × 6 sources,
 * SQLite handles this in <5ms — no need to paginate per-source.
 */
export function listActivityForTicker(ticker: string, limit = 100): ActivityEvent[] {
  const t = ticker.toUpperCase();
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM (
      SELECT published_at AS ts, 'news' AS kind, ticker, headline AS title,
             ('via ' || source) AS detail, url AS link, source
        FROM news WHERE ticker = ?
      UNION ALL
      SELECT filed_at AS ts, 'insider' AS kind, ticker,
             (insider_name || ' ' || code) AS title,
             ('shares ' || CAST(shares AS TEXT) || (CASE WHEN price IS NOT NULL THEN ' @ $' || CAST(price AS TEXT) ELSE '' END)) AS detail,
             filing_url AS link, source
        FROM insider_txns WHERE ticker = ?
      UNION ALL
      SELECT disclosed_at AS ts, 'congress' AS kind, ticker,
             (member || ' ' || kind) AS title,
             ('$' || CAST(COALESCE(amount_low,0) AS TEXT) || ' - $' || CAST(COALESCE(amount_high,0) AS TEXT) || ' on ' || txn_date) AS detail,
             ptr_url AS link, source
        FROM congress_trades WHERE ticker = ?
      UNION ALL
      SELECT filed_at AS ts, 'fund' AS kind, fh.ticker,
             (COALESCE(f.name, fh.cik) || ' position') AS title,
             ('shares ' || CAST(fh.shares AS TEXT) || ' as of ' || fh.period_end ||
                CASE WHEN fh.delta_shares IS NOT NULL THEN ' (' || CAST(fh.delta_shares AS TEXT) || ' QoQ)' ELSE '' END) AS detail,
             NULL AS link, 'edgar_13f' AS source
        FROM fund_holdings fh LEFT JOIN funds f ON f.cik = fh.cik
        WHERE fh.ticker = ?
      UNION ALL
      SELECT ts, 'sentiment' AS kind, ticker,
             ('rank #' || COALESCE(CAST(rank AS TEXT), '?')) AS title,
             ('mentions ' || CAST(mentions AS TEXT) ||
                CASE WHEN mentions_24h_ago IS NOT NULL THEN ' (was ' || CAST(mentions_24h_ago AS TEXT) || ')' ELSE '' END) AS detail,
             NULL AS link, source
        FROM sentiment_snapshots WHERE ticker = ?
      UNION ALL
      SELECT fetched_at AS ts, 'halt' AS kind, ticker,
             ('Trading halt ' || COALESCE(reason_code, '')) AS title,
             ('on ' || halt_date || ' ' || halt_time || ' (' || COALESCE(market, '?') || ')') AS detail,
             NULL AS link, 'nasdaq' AS source
        FROM trading_halts WHERE ticker = ?
    )
    ORDER BY ts DESC
    LIMIT ?
  `).all(t, t, t, t, t, t, limit) as ActivityEvent[];
  return rows;
}

/**
 * Same shape as listActivityForTicker but filters to a set of tickers (the
 * user's holdings + watchlist). Returns the union of activity across all of
 * them, sorted DESC by ts.
 */
export function listActivityForTickers(tickers: string[], limit = 50): ActivityEvent[] {
  if (tickers.length === 0) return [];
  const db = getDb();
  const upper = tickers.map(t => t.toUpperCase());
  const placeholders = upper.map(() => '?').join(',');
  // Build the same UNION as listActivityForTicker but with IN clause
  const rows = db.prepare(`
    SELECT * FROM (
      SELECT published_at AS ts, 'news' AS kind, ticker, headline AS title,
             ('via ' || source) AS detail, url AS link, source
        FROM news WHERE ticker IN (${placeholders})
      UNION ALL
      SELECT filed_at AS ts, 'insider' AS kind, ticker,
             (insider_name || ' ' || code) AS title,
             ('shares ' || CAST(shares AS TEXT) || (CASE WHEN price IS NOT NULL THEN ' @ $' || CAST(price AS TEXT) ELSE '' END)) AS detail,
             filing_url AS link, source
        FROM insider_txns WHERE ticker IN (${placeholders})
      UNION ALL
      SELECT disclosed_at AS ts, 'congress' AS kind, ticker,
             (member || ' ' || kind) AS title,
             ('$' || CAST(COALESCE(amount_low,0) AS TEXT) || ' - $' || CAST(COALESCE(amount_high,0) AS TEXT) || ' on ' || txn_date) AS detail,
             ptr_url AS link, source
        FROM congress_trades WHERE ticker IN (${placeholders})
      UNION ALL
      SELECT filed_at AS ts, 'fund' AS kind, fh.ticker,
             (COALESCE(f.name, fh.cik) || ' position') AS title,
             ('shares ' || CAST(fh.shares AS TEXT) || ' as of ' || fh.period_end ||
                CASE WHEN fh.delta_shares IS NOT NULL THEN ' (' || CAST(fh.delta_shares AS TEXT) || ' QoQ)' ELSE '' END) AS detail,
             NULL AS link, 'edgar_13f' AS source
        FROM fund_holdings fh LEFT JOIN funds f ON f.cik = fh.cik
        WHERE fh.ticker IN (${placeholders})
      UNION ALL
      SELECT fetched_at AS ts, 'halt' AS kind, ticker,
             ('Trading halt ' || COALESCE(reason_code, '')) AS title,
             ('on ' || halt_date || ' ' || halt_time || ' (' || COALESCE(market, '?') || ')') AS detail,
             NULL AS link, 'nasdaq' AS source
        FROM trading_halts WHERE ticker IN (${placeholders})
    )
    ORDER BY ts DESC
    LIMIT ?
  `).all(...upper, ...upper, ...upper, ...upper, ...upper, limit) as ActivityEvent[];
  return rows;
}
