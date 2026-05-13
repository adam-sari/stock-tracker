import { getDb } from '../db/connection';
import { listHoldings } from '../db/queries/holdings';
import { upsertDodContract } from '../db/queries/dod-contracts';
import { USASpendingClient, KNOWN_DEFENSE_RECIPIENTS } from '../providers/usaspending';

const LOOKBACK_DAYS = 30;

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function subtractDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setUTCDate(copy.getUTCDate() - n);
  return copy;
}

export async function refreshDodContractsOnce(
  client: USASpendingClient = new USASpendingClient(),
): Promise<{ tickers: number; stored: number }> {
  const db = getDb();
  const started = Math.floor(Date.now() / 1000);
  const job = db
    .prepare(`INSERT INTO job_runs (job, started_at, status) VALUES ('refresh_dod_contracts', ?, 'running')`)
    .run(started);

  let storedCount = 0;
  let tickerCount = 0;
  let error: string | null = null;

  try {
    // Build universe: held + watched tickers
    const holdings = listHoldings();
    const watchRows = db.prepare(`SELECT ticker FROM watchlist`).all() as Array<{ ticker: string }>;
    const universe = new Set<string>([
      ...holdings.map(h => h.ticker.toUpperCase()),
      ...watchRows.map(w => w.ticker.toUpperCase()),
    ]);

    // Filter to tickers that appear in our defense map
    const defenseTickers = Object.keys(KNOWN_DEFENSE_RECIPIENTS).filter(t => universe.has(t));

    const now = new Date();
    const endDate = toDateStr(now);
    const startDate = toDateStr(subtractDays(now, LOOKBACK_DAYS));

    for (const ticker of defenseTickers) {
      const recipientName = KNOWN_DEFENSE_RECIPIENTS[ticker];
      tickerCount++;
      try {
        const awards = await client.searchAwards({ recipientName, startDate, endDate });
        for (const award of awards) {
          upsertDodContract({
            ticker,
            recipient_name: award.recipientName,
            description: award.description,
            award_amount: award.awardAmount,
            action_date: award.actionDate,
            agency: award.awardingAgency,
            fetched_at: started,
          });
          storedCount++;
        }
      } catch (e) {
        console.warn(`[refresh-dod-contracts] failed for ${ticker}:`, (e as Error).message);
      }
    }
  } catch (e) {
    error = (e as Error).message;
    console.error('[refresh-dod-contracts] fatal error:', error);
  }

  db.prepare(`UPDATE job_runs SET finished_at=?, status=?, detail=? WHERE id=?`)
    .run(
      Math.floor(Date.now() / 1000),
      error ? 'error' : 'ok',
      error ?? `tickers=${tickerCount} stored=${storedCount}`,
      job.lastInsertRowid,
    );

  return { tickers: tickerCount, stored: storedCount };
}
