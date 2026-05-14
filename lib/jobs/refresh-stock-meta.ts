import { getDb } from '../db/connection';
import { listHoldings } from '../db/queries/holdings';
import { upsertStockMeta } from '../db/queries/stock-meta';
import type { FmpClient } from '../providers/fmp';
import type { FinnhubClient } from '../providers/finnhub';

export async function refreshStockMetaOnce(fmp: FmpClient, finnhub: FinnhubClient): Promise<{ updated: number }> {
  const db = getDb();
  const started = Math.floor(Date.now() / 1000);
  const job = db.prepare(`INSERT INTO job_runs (job, started_at, status) VALUES ('refresh_stock_meta', ?, 'running')`).run(started);

  let updated = 0;
  let error: string | null = null;
  try {
    const holdings = listHoldings();
    for (const h of holdings) {
      let fmpP: Awaited<ReturnType<FmpClient['getProfile']>> | null = null;
      let finP: Awaited<ReturnType<FinnhubClient['getProfile']>> | null = null;
      try { fmpP = await fmp.getProfile(h.ticker); } catch { /* fall through */ }
      try { finP = await finnhub.getProfile(h.ticker); } catch { /* fall through */ }
      if (!fmpP && !finP) continue;
      upsertStockMeta({
        ticker: h.ticker,
        name: fmpP?.name ?? finP?.name ?? h.ticker,
        description: fmpP?.description ?? undefined,
        industry: finP?.industry ?? fmpP?.industry ?? undefined,
        sector: fmpP?.sector ?? undefined,
        country: fmpP?.country ?? finP?.country ?? undefined,
        exchange: fmpP?.exchange ?? finP?.exchange ?? undefined,
        // Finnhub returns market cap in millions; FMP returns it in full dollars.
        // Normalise to full dollars so AboutPanel formatting is consistent (was
        // showing AAPL as $3M instead of $3T due to unit mismatch).
        market_cap: (finP?.marketCapMillions != null
          ? finP.marketCapMillions * 1_000_000
          : fmpP?.marketCap) ?? undefined,
        ipo_date: fmpP?.ipoDate ?? finP?.ipo ?? undefined,
        weburl: fmpP?.website ?? finP?.webUrl ?? undefined,
        logo_url: finP?.logoUrl ?? undefined,
        ceo: fmpP?.ceo ?? undefined,
        employees: fmpP?.employees ?? undefined,
        shares_outstanding: finP?.sharesOutstanding ?? undefined,
      });
      updated++;
    }
  } catch (e) { error = (e as Error).message; }

  db.prepare(`UPDATE job_runs SET finished_at=?, status=?, detail=? WHERE id=?`)
    .run(Math.floor(Date.now() / 1000), error ? 'error' : 'ok', error ?? `updated=${updated}`, job.lastInsertRowid);
  return { updated };
}
