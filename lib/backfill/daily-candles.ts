import { getDb } from '@/lib/db/connection';

export type AlpacaBar = { t: string; o: number; h: number; l: number; c: number; v: number };

export type BarFetcherInput = {
  symbols: string[];
  start: string;      // YYYY-MM-DD
  end: string;        // YYYY-MM-DD
  pageToken: string | null;
};

export type BarFetcherOutput = {
  bars: Record<string, AlpacaBar[]>;
  next_page_token: string | null;
};

export type BarFetcher = (input: BarFetcherInput) => Promise<BarFetcherOutput>;

/**
 * Backfill daily candles for `tickers` between `fromDate` and `toDate`.
 * Calls `fetcher` repeatedly until next_page_token is null.
 * Upserts into candles_daily via PRIMARY KEY (ticker, date).
 */
export async function backfillDailyCandles(
  tickers: string[],
  fromDate: string,
  toDate: string,
  fetcher: BarFetcher,
): Promise<number> {
  const db = getDb();
  const started = Math.floor(Date.now() / 1000);
  const job = db.prepare(
    `INSERT INTO job_runs (job, started_at, status) VALUES ('backfill_daily_candles', ?, 'running')`
  ).run(started);

  let written = 0;
  let error: string | null = null;
  const upsert = db.prepare(
    `INSERT INTO candles_daily (ticker, date, open, high, low, close, volume, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'alpaca-backfill')
     ON CONFLICT(ticker, date) DO UPDATE SET
       open=excluded.open, high=excluded.high, low=excluded.low,
       close=excluded.close, volume=excluded.volume`
  );

  try {
    let pageToken: string | null = null;
    do {
      const out: BarFetcherOutput = await fetcher({ symbols: tickers, start: fromDate, end: toDate, pageToken });
      const tx = db.transaction(() => {
        for (const [symbol, bars] of Object.entries(out.bars)) {
          for (const b of bars) {
            const date = b.t.slice(0, 10);
            upsert.run(symbol, date, b.o, b.h, b.l, b.c, b.v);
            written++;
          }
        }
      });
      tx();
      pageToken = out.next_page_token;
    } while (pageToken);
  } catch (e) { error = (e as Error).message; }

  db.prepare(`UPDATE job_runs SET finished_at=?, status=?, detail=? WHERE id=?`)
    .run(Math.floor(Date.now() / 1000), error ? 'error' : 'ok',
         error ?? `written=${written} tickers=${tickers.length}`, job.lastInsertRowid);

  if (error) throw new Error(error);
  return written;
}
