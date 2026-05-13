import { getDb } from '../db/connection';
import { upsertCongressTrades, hashCongressTrade, type CongressTradeRow } from '../db/queries/congress';
import type { FmpClient, FmpCongressTrade } from '../providers/fmp';

function toRow(t: FmpCongressTrade): CongressTradeRow | null {
  if (!t.ticker) return null;
  return {
    id: hashCongressTrade(t.ptrUrl, t.ticker, t.transactionDate),
    ticker: t.ticker,
    chamber: t.chamber,
    member: t.member,
    district: t.district,
    kind: t.kind,
    amount_low: t.amountLow,
    amount_high: t.amountHigh,
    txn_date: t.transactionDate,
    disclosed_at: Math.floor(new Date(t.disclosureDate || t.transactionDate).getTime() / 1000),
    ptr_url: t.ptrUrl,
    source: t.chamber === 'house' ? 'fmp_house' : 'fmp_senate',
  };
}

export async function refreshCongressOnce(fmp: FmpClient): Promise<{ senate: number; house: number }> {
  const db = getDb();
  const started = Math.floor(Date.now() / 1000);
  const job = db.prepare(`INSERT INTO job_runs (job, started_at, status) VALUES ('refresh_congress', ?, 'running')`).run(started);

  let senate = 0, house = 0;
  let error: string | null = null;
  try {
    const [senateRaw, houseRaw] = await Promise.all([fmp.getSenateLatest(), fmp.getHouseLatest()]);
    const senateRows = senateRaw.map(toRow).filter((r): r is CongressTradeRow => r !== null);
    const houseRows = houseRaw.map(toRow).filter((r): r is CongressTradeRow => r !== null);
    upsertCongressTrades(senateRows);
    upsertCongressTrades(houseRows);
    senate = senateRows.length;
    house = houseRows.length;
  } catch (e) { error = (e as Error).message; }

  db.prepare(`UPDATE job_runs SET finished_at=?, status=?, detail=? WHERE id=?`)
    .run(Math.floor(Date.now() / 1000), error ? 'error' : 'ok', error ?? `senate=${senate} house=${house}`, job.lastInsertRowid);
  return { senate, house };
}
