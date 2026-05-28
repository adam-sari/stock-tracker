import { getDb } from '@/lib/db/connection';
import { upsertCongressTrades, hashCongressTrade, type CongressTradeRow } from '@/lib/db/queries/congress';
import type { FmpClient, FmpCongressTrade } from '@/lib/providers/fmp';
import { CapitolTradesClient, type CapitolTradeItem } from '@/lib/providers/capitoltrades';

export type BackfillOpts = {
  fromDate: string;  // YYYY-MM-DD
  toDate: string;    // YYYY-MM-DD
};

function fmpToRow(t: FmpCongressTrade): CongressTradeRow | null {
  if (!t.ticker) return null;
  // Drop rows missing a disclosure date — using transactionDate as a fallback
  // introduces look-ahead bias: PTR rules give members ~30-45 days to file, so
  // disclosed_at = transactionDate makes the trade appear public weeks early.
  if (!t.disclosureDate) return null;
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
    disclosed_at: Math.floor(new Date(t.disclosureDate).getTime() / 1000),
    ptr_url: t.ptrUrl,
    source: t.chamber === 'house' ? 'fmp_house_backfill' : 'fmp_senate_backfill',
  };
}

function ctToRow(t: CapitolTradeItem): CongressTradeRow | null {
  if (!t.disclosedAt) return null;
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
    disclosed_at: Math.floor(new Date(t.disclosedAt).getTime() / 1000),
    ptr_url: '',
    source: `capitoltrades_${t.chamber}_backfill`,
  };
}

function countMissingDisclosureFmp(raw: FmpCongressTrade[]): number {
  return raw.filter(t => t.ticker && !t.disclosureDate).length;
}
function countMissingDisclosureCt(raw: CapitolTradeItem[]): number {
  return raw.filter(t => t.ticker && !t.disclosedAt).length;
}

function inWindow(date: string, opts: BackfillOpts): boolean {
  return date >= opts.fromDate && date <= opts.toDate;
}

export async function backfillCongressTrades(
  fmp: FmpClient,
  ct: CapitolTradesClient,
  opts: BackfillOpts,
): Promise<{ inserted: number; senate: number; house: number; warnings: string[] }> {
  const db = getDb();
  const started = Math.floor(Date.now() / 1000);
  const job = db.prepare(
    `INSERT INTO job_runs (job, started_at, status) VALUES ('backfill_congress', ?, 'running')`
  ).run(started);

  let inserted = 0, senate = 0, house = 0;
  const warnings: string[] = [];
  let error: string | null = null;

  try {
    // Senate
    let senateRows: CongressTradeRow[];
    try {
      const raw = await fmp.getSenateLatest();
      const dropped = countMissingDisclosureFmp(raw);
      if (dropped > 0) warnings.push(`senate_missing_disclosure: ${dropped}`);
      senateRows = raw.map(fmpToRow).filter((r): r is CongressTradeRow => r !== null && inWindow(r.txn_date, opts));
    } catch (e) {
      warnings.push(`senate_fmp: ${(e as Error).message.slice(0, 80)}`);
      const fallback = await ct.getRecentTrades(500);
      const inWindowFallback = fallback.filter(t => t.chamber === 'senate' && inWindow(t.txnDate, opts));
      const dropped = countMissingDisclosureCt(inWindowFallback);
      if (dropped > 0) warnings.push(`senate_missing_disclosure: ${dropped}`);
      senateRows = inWindowFallback.map(ctToRow).filter((r): r is CongressTradeRow => r !== null);
    }
    upsertCongressTrades(senateRows);
    senate = senateRows.length;
    inserted += senate;

    // House
    let houseRows: CongressTradeRow[];
    try {
      const raw = await fmp.getHouseLatest();
      const dropped = countMissingDisclosureFmp(raw);
      if (dropped > 0) warnings.push(`house_missing_disclosure: ${dropped}`);
      houseRows = raw.map(fmpToRow).filter((r): r is CongressTradeRow => r !== null && inWindow(r.txn_date, opts));
    } catch (e) {
      warnings.push(`house_fmp: ${(e as Error).message.slice(0, 80)}`);
      const fallback = await ct.getRecentTrades(500);
      const inWindowFallback = fallback.filter(t => t.chamber === 'house' && inWindow(t.txnDate, opts));
      const dropped = countMissingDisclosureCt(inWindowFallback);
      if (dropped > 0) warnings.push(`house_missing_disclosure: ${dropped}`);
      houseRows = inWindowFallback.map(ctToRow).filter((r): r is CongressTradeRow => r !== null);
    }
    upsertCongressTrades(houseRows);
    house = houseRows.length;
    inserted += house;
  } catch (e) { error = (e as Error).message; }

  db.prepare(`UPDATE job_runs SET finished_at=?, status=?, detail=? WHERE id=?`)
    .run(Math.floor(Date.now() / 1000), error ? 'error' : 'ok',
         error ?? `inserted=${inserted} senate=${senate} house=${house} ${warnings.join(' ')}`,
         job.lastInsertRowid);

  if (error) throw new Error(error);
  return { inserted, senate, house, warnings };
}
