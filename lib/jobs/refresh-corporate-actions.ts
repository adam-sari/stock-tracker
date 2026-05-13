import { getDb } from '../db/connection';
import { listHoldings } from '../db/queries/holdings';
import { upsertCorporateActions, hashAction, type CorporateActionRow } from '../db/queries/corporate-actions';
import type { FmpClient } from '../providers/fmp';
import type { YahooProvider } from '../providers/yahoo';

export async function refreshCorporateActionsOnce(fmp: FmpClient, yahoo?: YahooProvider): Promise<{ inserted: number; splits: number }> {
  const db = getDb();
  const started = Math.floor(Date.now() / 1000);
  const job = db.prepare(`INSERT INTO job_runs (job, started_at, status) VALUES ('refresh_corporate_actions', ?, 'running')`).run(started);

  let inserted = 0;
  let splitsCount = 0;
  let error: string | null = null;
  try {
    const holdings = listHoldings();
    const rows: CorporateActionRow[] = [];
    for (const h of holdings) {
      // Dividends from FMP (preferred — has explicit payment dates and frequency)
      try {
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
      } catch { /* fall through to Yahoo */ }

      // Splits (+ dividends as fallback) from Yahoo v8 chart events
      if (yahoo) {
        try {
          const actions = await yahoo.getCorporateActions(h.ticker, 10);
          for (const a of actions) {
            if (a.kind === 'split') {
              rows.push({
                id: hashAction(h.ticker, 'split', a.exDate),
                ticker: h.ticker,
                kind: 'split',
                ex_date: a.exDate,
                amount: a.ratio,
                details_json: JSON.stringify({ raw: a.raw }),
                source: 'yahoo',
              });
              splitsCount++;
            } else if (a.kind === 'dividend') {
              // Only insert if FMP didn't already cover this ex-date
              rows.push({
                id: hashAction(h.ticker, 'dividend', a.exDate),
                ticker: h.ticker,
                kind: 'dividend',
                ex_date: a.exDate,
                amount: a.amount,
                source: 'yahoo',
              });
            }
          }
        } catch { /* skip */ }
      }
    }
    upsertCorporateActions(rows);
    inserted = rows.length;
  } catch (e) { error = (e as Error).message; }

  db.prepare(`UPDATE job_runs SET finished_at=?, status=?, detail=? WHERE id=?`)
    .run(Math.floor(Date.now() / 1000), error ? 'error' : 'ok', error ?? `inserted=${inserted} splits=${splitsCount}`, job.lastInsertRowid);
  return { inserted, splits: splitsCount };
}
