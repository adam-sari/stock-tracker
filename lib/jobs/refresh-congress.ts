import { getDb } from '../db/connection';
import { upsertCongressTrades, hashCongressTrade, type CongressTradeRow } from '../db/queries/congress';
import type { FmpClient, FmpCongressTrade } from '../providers/fmp';
import { CapitolTradesClient, type CapitolTradeItem } from '../providers/capitoltrades';

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

function capTradeToRow(t: CapitolTradeItem): CongressTradeRow {
  const key = `${t.member}|${t.ticker}|${t.txnDate}`;
  return {
    id: hashCongressTrade(key, t.ticker, t.txnDate),
    ticker: t.ticker,
    chamber: t.chamber,
    member: t.member,
    district: '',
    kind: t.kind,
    amount_low: t.amountLow,
    amount_high: t.amountHigh,
    txn_date: t.txnDate,
    disclosed_at: t.disclosedAt ? Math.floor(new Date(t.disclosedAt).getTime() / 1000) : 0,
    ptr_url: '',
    source: `capitoltrades_${t.chamber}`,
  };
}

export async function refreshCongressOnce(
  fmp: FmpClient,
  ct: CapitolTradesClient = new CapitolTradesClient(),
): Promise<{ senate: number; house: number }> {
  const db = getDb();
  const started = Math.floor(Date.now() / 1000);
  const job = db.prepare(`INSERT INTO job_runs (job, started_at, status) VALUES ('refresh_congress', ?, 'running')`).run(started);

  let senate = 0, house = 0;
  let error: string | null = null;
  const warnings: string[] = [];

  try {
    // Senate — try FMP first, fall back to Capitol Trades
    let senateRows: CongressTradeRow[];
    try {
      const raw = await fmp.getSenateLatest();
      senateRows = raw.map(toRow).filter((r): r is CongressTradeRow => r !== null);
    } catch (e) {
      warnings.push(`senate_fmp_fail: ${(e as Error).message.slice(0, 80)}`);
      try {
        const fallback = await ct.getRecentTrades(200);
        senateRows = fallback.filter(t => t.chamber === 'senate').map(capTradeToRow);
        warnings.push(`senate_ct_fallback: ${senateRows.length}`);
      } catch {
        senateRows = [];
      }
    }

    // House — try FMP first, fall back to Capitol Trades
    let houseRows: CongressTradeRow[];
    try {
      const raw = await fmp.getHouseLatest();
      houseRows = raw.map(toRow).filter((r): r is CongressTradeRow => r !== null);
    } catch (e) {
      warnings.push(`house_fmp_fail: ${(e as Error).message.slice(0, 80)}`);
      try {
        const fallback = await ct.getRecentTrades(200);
        houseRows = fallback.filter(t => t.chamber === 'house').map(capTradeToRow);
        warnings.push(`house_ct_fallback: ${houseRows.length}`);
      } catch {
        houseRows = [];
      }
    }

    upsertCongressTrades(senateRows);
    upsertCongressTrades(houseRows);
    senate = senateRows.length;
    house = houseRows.length;
  } catch (e) { error = (e as Error).message; }

  const detail = error ?? [`senate=${senate}`, `house=${house}`, ...warnings].join(' ');
  db.prepare(`UPDATE job_runs SET finished_at=?, status=?, detail=? WHERE id=?`)
    .run(Math.floor(Date.now() / 1000), error ? 'error' : 'ok', detail, job.lastInsertRowid);
  return { senate, house };
}
