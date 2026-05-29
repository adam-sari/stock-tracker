import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';
import { resolveCitationSource } from '@/lib/research/citation-sources';

const DIR = path.join(process.cwd(), '.vitest-cache', 'citation-sources');
const DB = path.join(DIR, 'test.db');

function reset() {
  closeDb();
  if (existsSync(DIR)) rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
  process.env.DB_PATH = DB;
  applySchema(getDb());
}

describe('resolveCitationSource', () => {
  beforeEach(reset);
  afterAll(() => { closeDb(); rmSync(DIR, { recursive: true, force: true }); });

  it('resolves an insider_txns row with full role + price', () => {
    getDb().prepare(`INSERT INTO insider_txns (id, ticker, insider_name, insider_role, code,
      is_derivative, shares, price, txn_date, filed_at, source)
      VALUES ('abc', 'EPAM', 'Balazs Fejes', 'CEO, President', 'P', 0, 77.55, 96.71, '2026-04-30', 1714435200, 'edgar')`).run();
    const r = resolveCitationSource(getDb(), 'insider_txns', 'abc');
    expect(r.summary).toContain('Balazs Fejes');
    expect(r.summary).toContain('CEO');
    expect(r.summary).toContain('77.55');
    expect(r.summary).toContain('96.71');
    expect(r.summary).toContain('2026-04-30');
    expect(r.deepLink).toBe('/stock/EPAM?tab=insiders&highlight=abc');
  });

  it('resolves a fund_holdings row using composite id', () => {
    getDb().prepare(`INSERT INTO funds (cik, name, is_curated) VALUES ('001', 'Tiger Global', 1)`).run();
    getDb().prepare(`INSERT INTO fund_holdings (filing_accession, cik, ticker, shares, value_usd, period_end, filed_at, delta_shares)
      VALUES ('F1Q1', '001', 'EPAM', 1200000, 100000000, '2026-03-31', 1715000000, 50000)`).run();
    const r = resolveCitationSource(getDb(), 'fund_holdings', 'F1Q1|EPAM');
    expect(r.summary).toContain('Tiger Global');
    expect(r.summary).toContain('2026-03-31');
    expect(r.deepLink).toBe('/stock/EPAM?tab=funds&accession=F1Q1');
  });

  it('resolves a congress_trades row', () => {
    getDb().prepare(`INSERT INTO congress_trades (id, ticker, chamber, member, kind, txn_date, disclosed_at, ptr_url, source, amount_low, amount_high)
      VALUES ('ct1', 'EPAM', 'house', 'Pelosi', 'Purchase', '2026-04-10', 1714000000, 'http://x', 'fmp', 1000, 15000)`).run();
    const r = resolveCitationSource(getDb(), 'congress_trades', 'ct1');
    expect(r.summary).toContain('Pelosi');
    expect(r.summary).toContain('Purchase');
    expect(r.deepLink).toBe('/stock/EPAM?tab=congress&highlight=ct1');
  });

  it('resolves candles_daily with composite id', () => {
    getDb().prepare(`INSERT INTO candles_daily (ticker, date, open, high, low, close, volume, source)
      VALUES ('EPAM', '2026-05-07', 103, 111.4, 99.65, 104.24, 3580000, 'alpaca')`).run();
    const r = resolveCitationSource(getDb(), 'candles_daily', 'EPAM|2026-05-07');
    expect(r.summary).toContain('104.24');
    expect(r.summary).toContain('2026-05-07');
    expect(r.deepLink).toBe('/stock/EPAM?tab=activity&date=2026-05-07');
  });

  it('resolves news with external URL as deep link', () => {
    getDb().prepare(`INSERT INTO news (id, ticker, headline, url, source, published_at, fetched_at)
      VALUES ('n1', 'EPAM', 'EPAM guides Q2 below consensus', 'https://bloomberg.com/x', 'Bloomberg', 1714000000, 1714000001)`).run();
    const r = resolveCitationSource(getDb(), 'news', 'n1');
    expect(r.summary).toContain('Bloomberg');
    expect(r.summary).toContain('EPAM guides Q2');
    expect(r.deepLink).toBe('https://bloomberg.com/x');
  });

  it('resolves stock_meta by ticker', () => {
    getDb().prepare(`INSERT INTO stock_meta (ticker, name, sector, market_cap)
      VALUES ('EPAM', 'EPAM Systems', 'IT Services', 5800000000)`).run();
    const r = resolveCitationSource(getDb(), 'stock_meta', 'EPAM');
    expect(r.summary).toContain('EPAM Systems');
    expect(r.deepLink).toBe('/stock/EPAM?tab=about');
  });

  it('resolves backtest_scores with triple composite key', () => {
    getDb().prepare(`INSERT INTO backtest_scores (date, ticker, signal_kind, score, detail_json)
      VALUES ('2026-05-04', 'EPAM', 'insider', 1.0, '{"distinctBuyers":6}')`).run();
    const r = resolveCitationSource(getDb(), 'backtest_scores', '2026-05-04|EPAM|insider');
    expect(r.summary).toContain('1');
    expect(r.summary).toContain('insider');
    expect(r.deepLink).toBe('/stock/EPAM?tab=backtest');
  });

  it('returns sentinel "Source not found" for unknown rows but does not throw', () => {
    const r = resolveCitationSource(getDb(), 'insider_txns', 'does-not-exist');
    expect(r.summary).toBe('Source not found (insider_txns:does-not-exist)');
    expect(r.deepLink).toBe('#');
  });

  it('returns sentinel for unknown source tables', () => {
    const r = resolveCitationSource(getDb(), 'totally_made_up' as any, 'anything');
    expect(r.summary).toContain('Unknown source');
    expect(r.deepLink).toBe('#');
  });

  it('resolves web_search by short tag', () => {
    const r = resolveCitationSource(getDb(), 'web_search' as any, 'bloomberg-eps-miss');
    expect(r.summary).toBe('Web search: bloomberg-eps-miss');
    expect(r.deepLink).toBe('#');
  });
});
