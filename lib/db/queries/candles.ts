import { getDb } from '../connection';
import type { Bar } from '../../providers/types';

export function upsertQuoteLatest(row: {
  ticker: string;
  price: number;
  bid?: number;
  ask?: number;
  bidSize?: number;
  askSize?: number;
  session: 'regular' | 'pre' | 'post';
  ts: number;
  source: string;
}) {
  const db = getDb();
  db.prepare(`
    INSERT INTO quotes_latest (ticker, price, bid, ask, bid_size, ask_size, session, ts, source)
    VALUES (@ticker, @price, @bid, @ask, @bidSize, @askSize, @session, @ts, @source)
    ON CONFLICT (ticker) DO UPDATE SET
      price = excluded.price,
      bid = excluded.bid,
      ask = excluded.ask,
      bid_size = excluded.bid_size,
      ask_size = excluded.ask_size,
      session = excluded.session,
      ts = excluded.ts,
      source = excluded.source
  `).run({
    ticker: row.ticker.toUpperCase(),
    price: row.price,
    bid: row.bid ?? null,
    ask: row.ask ?? null,
    bidSize: row.bidSize ?? null,
    askSize: row.askSize ?? null,
    session: row.session,
    ts: row.ts,
    source: row.source,
  });
}

export function upsertCandles1m(bars: Bar[], source: string) {
  if (bars.length === 0) return;
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO candles_1m (ticker, ts, open, high, low, close, volume, session, source)
    VALUES (@ticker, @ts, @open, @high, @low, @close, @volume, @session, @source)
    ON CONFLICT (ticker, ts) DO UPDATE SET
      open = excluded.open,
      high = excluded.high,
      low = excluded.low,
      close = excluded.close,
      volume = excluded.volume
  `);
  const tx = db.transaction((rows: Bar[]) => {
    for (const r of rows) stmt.run({ ...r, ticker: r.ticker.toUpperCase(), source });
  });
  tx(bars);
}

export function getCandles1m(ticker: string, fromTs: number, toTs: number): Bar[] {
  const db = getDb();
  return db.prepare(`
    SELECT ticker, ts, open, high, low, close, volume, session
    FROM candles_1m
    WHERE ticker = ? AND ts >= ? AND ts <= ?
    ORDER BY ts
  `).all(ticker.toUpperCase(), fromTs, toTs) as Bar[];
}

export type DailyCandle = { ticker: string; date: string; open: number; high: number; low: number; close: number; volume: number };

export function upsertCandlesDaily(bars: Bar[], source: string) {
  if (bars.length === 0) return;
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO candles_daily (ticker, date, open, high, low, close, volume, source)
    VALUES (@ticker, @date, @open, @high, @low, @close, @volume, @source)
    ON CONFLICT (ticker, date) DO UPDATE SET
      open = excluded.open,
      high = excluded.high,
      low = excluded.low,
      close = excluded.close,
      volume = excluded.volume
  `);
  const tx = db.transaction((rows: Bar[]) => {
    for (const r of rows) {
      const date = new Date(r.ts * 1000).toISOString().slice(0, 10);
      stmt.run({
        ticker: r.ticker.toUpperCase(),
        date,
        open: r.open,
        high: r.high,
        low: r.low,
        close: r.close,
        volume: r.volume,
        source,
      });
    }
  });
  tx(bars);
}

export function getCandlesDaily(ticker: string, fromDate: string, toDate: string): DailyCandle[] {
  const db = getDb();
  return db.prepare(`
    SELECT ticker, date, open, high, low, close, volume
    FROM candles_daily
    WHERE ticker = ? AND date >= ? AND date <= ?
    ORDER BY date
  `).all(ticker.toUpperCase(), fromDate, toDate) as DailyCandle[];
}
