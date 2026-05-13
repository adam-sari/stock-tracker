// TODO Plan 2.5: Yahoo splits via /v8/finance/chart meta.events
import { getDb } from '../db/connection';
import { listHoldings } from '../db/queries/holdings';
import { upsertCorporateActions, hashAction, type CorporateActionRow } from '../db/queries/corporate-actions';
import type { FmpClient } from '../providers/fmp';

export async function refreshCorporateActionsOnce(fmp: FmpClient): Promise<{ inserted: number }> {
  const db = getDb();
  const started = Math.floor(Date.now() / 1000);
  const job = db.prepare(`INSERT INTO job_runs (job, started_at, status) VALUES ('refresh_corporate_actions', ?, 'running')`).run(started);

  let inserted = 0;
  let error: string | null = null;
  try {
    const holdings = listHoldings();
    const rows: CorporateActionRow[] = [];
    for (const h of holdings) {
      const divs = await fmp.getDividends(h.ticker);
      for (const d of divs) {
        rows.push({
          id: hashAction(d.symbol, 'dividend', d.exDate),
          ticker: d.symbol,
          kind: 'dividend',
          ex_date: d.exDate,
          payment_date: d.paymentDate || undefined,
          amount: d.dividend,
          details_json: JSON.stringify({ frequency: d.frequency, yield: d.yield, declarationDate: d.declarationDate }),
          source: 'fmp',
        });
      }
    }
    upsertCorporateActions(rows);
    inserted = rows.length;
  } catch (e) { error = (e as Error).message; }

  db.prepare(`UPDATE job_runs SET finished_at=?, status=?, detail=? WHERE id=?`)
    .run(Math.floor(Date.now() / 1000), error ? 'error' : 'ok', error ?? `inserted=${inserted}`, job.lastInsertRowid);
  return { inserted };
}
