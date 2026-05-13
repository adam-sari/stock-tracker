import { getDb } from '../db/connection';
import { upsertCabinetTrades, hashCabinetTrade, type CabinetTradeRow } from '../db/queries/cabinet-trades';
import { OpenCabinetClient, type OpenCabinetTransaction } from '../providers/open-cabinet';

function toRow(txn: OpenCabinetTransaction, fetchedAt: number): CabinetTradeRow {
  const role = [txn.title, txn.agency].filter(Boolean).join(' — ');
  return {
    id: hashCabinetTrade(txn.officialName, txn.ticker, txn.date, txn.kind),
    ticker: txn.ticker,
    official_name: txn.officialName,
    role,
    transaction_date: txn.date,
    amount_low: txn.amountLow,
    amount_high: txn.amountHigh,
    kind: txn.kind,
    ptr_url: '',
    source: 'open_cabinet',
    fetched_at: fetchedAt,
  };
}

export async function refreshCabinetTradesOnce(
  client: OpenCabinetClient = new OpenCabinetClient(),
): Promise<{ stored: number }> {
  const db = getDb();
  const started = Math.floor(Date.now() / 1000);
  const job = db
    .prepare(`INSERT INTO job_runs (job, started_at, status) VALUES ('refresh_cabinet_trades', ?, 'running')`)
    .run(started);

  let stored = 0;
  let error: string | null = null;

  try {
    const txns = await client.fetchTransactions();
    const rows = txns.map(t => toRow(t, started));
    upsertCabinetTrades(rows);
    stored = rows.length;
  } catch (e) {
    error = (e as Error).message;
    console.error('[refresh-cabinet-trades] error:', error);
  }

  db.prepare(`UPDATE job_runs SET finished_at=?, status=?, detail=? WHERE id=?`).run(
    Math.floor(Date.now() / 1000),
    error ? 'error' : 'ok',
    error ?? `stored=${stored}`,
    job.lastInsertRowid,
  );

  return { stored };
}
