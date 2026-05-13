import { getDb } from '../db/connection';
import { listHoldings } from '../db/queries/holdings';
import { upsertRecommendations, type RecommendationRow } from '../db/queries/recommendations';
import type { FinnhubClient } from '../providers/finnhub';

export async function refreshRecommendationsOnce(finnhub: FinnhubClient): Promise<{ updated: number }> {
  const db = getDb();
  const started = Math.floor(Date.now() / 1000);
  const job = db.prepare(`INSERT INTO job_runs (job, started_at, status) VALUES ('refresh_recommendations', ?, 'running')`).run(started);

  let updated = 0;
  let error: string | null = null;
  try {
    const holdings = listHoldings();
    for (const h of holdings) {
      const recs = await finnhub.getRecommendation(h.ticker);
      const rows: RecommendationRow[] = recs.map(r => ({
        ticker: r.ticker, period: r.period,
        strong_buy: r.strongBuy, buy: r.buy, hold: r.hold, sell: r.sell, strong_sell: r.strongSell,
      }));
      upsertRecommendations(rows);
      updated += rows.length;
    }
  } catch (e) { error = (e as Error).message; }

  db.prepare(`UPDATE job_runs SET finished_at=?, status=?, detail=? WHERE id=?`)
    .run(Math.floor(Date.now() / 1000), error ? 'error' : 'ok', error ?? `updated=${updated}`, job.lastInsertRowid);
  return { updated };
}
