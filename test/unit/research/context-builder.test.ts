import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';
import { buildTickerContext } from '@/lib/research/context-builder';

const DIR = path.join(process.cwd(), '.vitest-cache', 'context-builder');
const DB = path.join(DIR, 'test.db');

function reset() {
  closeDb();
  if (existsSync(DIR)) rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
  process.env.DB_PATH = DB;
  applySchema(getDb());
}

function nowSec() { return Math.floor(Date.now() / 1000); }

describe('buildTickerContext', () => {
  beforeEach(reset);
  afterAll(() => { closeDb(); rmSync(DIR, { recursive: true, force: true }); });

  it('returns a fully-shaped object with empty sub-arrays when DB has no data', () => {
    const ctx = buildTickerContext('XXXX', getDb(), 'standard');
    expect(ctx.ticker).toBe('XXXX');
    expect(ctx.meta).toBeNull();
    expect(ctx.signals_last_90d.insider).toEqual([]);
    expect(ctx.signals_last_90d.congress).toEqual([]);
    expect(ctx.signals_last_90d.funds_latest_quarter).toEqual([]);
    expect(ctx.signals_last_90d.volume_spikes).toEqual([]);
    expect(ctx.signals_last_90d.halts).toEqual([]);
    expect(ctx.price_summary).toBeNull();
    expect(ctx.news_last_90d).toEqual([]);
    expect(ctx.backtest_summary).toBeNull();
  });

  it('includes stock_meta with a cite marker', () => {
    getDb().prepare(`INSERT INTO stock_meta (ticker, name, sector, market_cap, ceo)
      VALUES ('EPAM', 'EPAM Systems', 'IT Services', 5800000000, 'Balazs Fejes')`).run();
    const ctx = buildTickerContext('EPAM', getDb(), 'standard');
    expect(ctx.meta).toMatchObject({ name: 'EPAM Systems', sector: 'IT Services', ceo: 'Balazs Fejes' });
    expect(ctx.meta!.cite).toBe('stock_meta:EPAM');
  });

  it('groups insider buys by filed_at date with a primary citable id', () => {
    const now = nowSec();
    getDb().prepare(`INSERT INTO insider_txns (id, ticker, insider_name, code, is_derivative,
      shares, txn_date, filed_at, source)
      VALUES ('a','EPAM','Fejes','P',0,77.55,'2026-04-30',?,'edgar'),
             ('b','EPAM','Peterson','P',0,77.55,'2026-04-30',?,'edgar'),
             ('c','EPAM','Rockwell','P',0,77.55,'2026-04-30',?,'edgar')`).run(now, now, now);
    const ctx = buildTickerContext('EPAM', getDb(), 'standard');
    expect(ctx.signals_last_90d.insider).toHaveLength(1);
    const row = ctx.signals_last_90d.insider[0];
    expect(row.insiders).toEqual(expect.arrayContaining(['Fejes', 'Peterson', 'Rockwell']));
    expect(row.total_shares).toBeCloseTo(77.55 * 3, 5);
    expect(['a', 'b', 'c']).toContain(row.primary_id);
    expect(row.cite).toBe(`insider_txns:${row.primary_id}`);
  });

  it('only includes signals from the last 90 days', () => {
    const now = nowSec();
    const oldFiled = now - 200 * 86400;
    getDb().prepare(`INSERT INTO insider_txns (id, ticker, insider_name, code, is_derivative,
      shares, txn_date, filed_at, source) VALUES ('old','EPAM','Old','P',0,1,'2025-01-01',?,'edgar'),
             ('new','EPAM','New','P',0,1,'2026-05-01',?,'edgar')`).run(oldFiled, now);
    const ctx = buildTickerContext('EPAM', getDb(), 'standard');
    const allInsiders = ctx.signals_last_90d.insider.flatMap(r => r.insiders);
    expect(allInsiders).toContain('New');
    expect(allInsiders).not.toContain('Old');
  });

  it('builds price_summary with 1y high/low and forward returns', () => {
    for (let i = 0; i < 30; i++) {
      const d = new Date('2026-04-01T00:00:00Z'); d.setUTCDate(d.getUTCDate() + i);
      const close = 100 + i;
      getDb().prepare(`INSERT INTO candles_daily (ticker, date, open, high, low, close, volume, source)
        VALUES ('EPAM', ?, ?, ?, ?, ?, 1000000, 'alpaca')`).run(d.toISOString().slice(0,10), close, close + 1, close - 1, close);
    }
    const ctx = buildTickerContext('EPAM', getDb(), 'standard');
    expect(ctx.price_summary).not.toBeNull();
    expect(ctx.price_summary!.high_1y.value).toBeGreaterThan(0);
    expect(ctx.price_summary!.latest_close).toBeGreaterThan(0);
  });

  it('flags volume spikes (>2x trailing average) with cite', () => {
    // Dates are relative to today so the spike always falls inside the 90-day window.
    const start = new Date(); start.setUTCHours(0, 0, 0, 0); start.setUTCDate(start.getUTCDate() - 40);
    const isoDay = (offset: number) => {
      const d = new Date(start); d.setUTCDate(d.getUTCDate() + offset);
      return d.toISOString().slice(0, 10);
    };
    for (let i = 0; i < 30; i++) {
      getDb().prepare(`INSERT INTO candles_daily (ticker, date, open, high, low, close, volume, source)
        VALUES ('EPAM', ?, 100, 101, 99, 100, 1000000, 'alpaca')`).run(isoDay(i));
    }
    getDb().prepare(`INSERT INTO candles_daily (ticker, date, open, high, low, close, volume, source)
      VALUES ('EPAM', ?, 100, 101, 99, 100, 5000000, 'alpaca')`).run(isoDay(30));
    const ctx = buildTickerContext('EPAM', getDb(), 'standard');
    const spikes = ctx.signals_last_90d.volume_spikes;
    expect(spikes.length).toBeGreaterThanOrEqual(1);
    expect(spikes[0].cite).toContain('candles_daily:EPAM|');
  });

  it('upper-cases the ticker', () => {
    const ctx = buildTickerContext('epam', getDb(), 'standard');
    expect(ctx.ticker).toBe('EPAM');
  });
});
