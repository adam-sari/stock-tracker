import { getDb } from '../connection';

export type SentimentSnapshot = {
  ticker: string;
  ts: number;
  source: string;
  rank?: number;
  mentions: number;
  upvotes?: number;
  mentions_24h_ago?: number;
};

export function upsertSentimentSnapshots(rows: SentimentSnapshot[]) {
  if (rows.length === 0) return;
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO sentiment_snapshots (ticker, ts, source, rank, mentions, upvotes, mentions_24h_ago)
    VALUES (@ticker, @ts, @source, @rank, @mentions, @upvotes, @mentions_24h_ago)
    ON CONFLICT (ticker, ts, source) DO UPDATE SET
      rank = excluded.rank, mentions = excluded.mentions, upvotes = excluded.upvotes, mentions_24h_ago = excluded.mentions_24h_ago
  `);
  const tx = db.transaction((items: SentimentSnapshot[]) => {
    for (const r of items) stmt.run({
      ...r,
      ticker: r.ticker.toUpperCase(),
      rank: r.rank ?? null,
      upvotes: r.upvotes ?? null,
      mentions_24h_ago: r.mentions_24h_ago ?? null,
    });
  });
  tx(rows);
}

export function latestSentimentForTicker(ticker: string, source = 'apewisdom'): SentimentSnapshot | null {
  const db = getDb();
  return (db.prepare(`SELECT * FROM sentiment_snapshots WHERE ticker=? AND source=? ORDER BY ts DESC LIMIT 1`).get(ticker.toUpperCase(), source) as SentimentSnapshot | undefined) ?? null;
}
