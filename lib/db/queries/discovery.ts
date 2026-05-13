import { getDb } from '../connection';

export type DiscoveryScoreRow = {
  ticker: string;
  score: number;
  signals_json: string;
  computed_at: number;
};

export function upsertDiscoveryScore(row: DiscoveryScoreRow) {
  getDb().prepare(`
    INSERT INTO discovery_scores (ticker, score, signals_json, computed_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT (ticker) DO UPDATE SET score = excluded.score, signals_json = excluded.signals_json, computed_at = excluded.computed_at
  `).run(row.ticker.toUpperCase(), row.score, row.signals_json, row.computed_at);
}

export function clearStaleDiscoveryScores(cutoff: number) {
  getDb().prepare(`DELETE FROM discovery_scores WHERE computed_at < ?`).run(cutoff);
}

export function listDiscoveryTopN(limit = 50): DiscoveryScoreRow[] {
  return getDb().prepare(`SELECT * FROM discovery_scores ORDER BY score DESC LIMIT ?`).all(limit) as DiscoveryScoreRow[];
}
