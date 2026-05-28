/**
 * Direct point-in-time tests for lib/backtest/asof-readers.ts.
 *
 * Every backtest signal depends on the as-of contract: rows with timestamps
 * after the as-of date must never bleed into a backtested score. These tests
 * codify what asof-readers.ts currently does at the boundaries so future
 * changes break visibly.
 */
import { describe, it, expect, afterAll } from 'vitest';
import type Database from 'better-sqlite3';
import { makeTestDb, cleanupTestDb, ts } from './helpers';
import {
  asOfEpoch,
  lookbackEpoch,
  readCandlesAsOf,
  readInsiderAsOf,
  readCongressAsOf,
  readFundsAsOf,
  readHaltsAsOf,
  readSentimentAsOf,
} from '@/lib/backtest/asof-readers';

// ---------- insert helpers ----------

function insCandle(db: Database.Database, ticker: string, date: string, volume = 1_000_000) {
  db.prepare(
    `INSERT INTO candles_daily (ticker, date, open, high, low, close, volume, source)
     VALUES (?, ?, 1, 2, 0.5, 1.5, ?, 'test')`,
  ).run(ticker, date, volume);
}

function insInsider(
  db: Database.Database,
  args: { id: string; ticker: string; filed_at: number; insider?: string; code?: string },
) {
  db.prepare(
    `INSERT INTO insider_txns (id, ticker, insider_name, code, is_derivative, shares, txn_date, filed_at, source)
     VALUES (?, ?, ?, ?, 0, 100, '2024-01-01', ?, 'test')`,
  ).run(args.id, args.ticker, args.insider ?? 'X', args.code ?? 'P', args.filed_at);
}

function insCongress(
  db: Database.Database,
  args: { id: string; ticker: string; disclosed_at: number; member?: string },
) {
  db.prepare(
    `INSERT INTO congress_trades (id, ticker, chamber, member, kind, txn_date, disclosed_at, ptr_url, source)
     VALUES (?, ?, 'house', ?, 'P', '2024-01-01', ?, 'http://x', 'test')`,
  ).run(args.id, args.ticker, args.member ?? 'M', args.disclosed_at);
}

function insFund(
  db: Database.Database,
  args: {
    accession: string;
    cik: string;
    ticker: string;
    filed_at: number;
    period_end?: string;
    delta_shares?: number | null;
  },
) {
  db.prepare(
    `INSERT INTO fund_holdings (filing_accession, cik, ticker, shares, value_usd, period_end, filed_at, delta_shares)
     VALUES (?, ?, ?, 1000, 100000, ?, ?, ?)`,
  ).run(
    args.accession,
    args.cik,
    args.ticker,
    args.period_end ?? '2024-01-01',
    args.filed_at,
    args.delta_shares ?? null,
  );
}

function insHalt(
  db: Database.Database,
  args: { id: string; ticker: string; fetched_at: number; reason?: string },
) {
  db.prepare(
    `INSERT INTO trading_halts (id, ticker, halt_date, halt_time, reason_code, fetched_at)
     VALUES (?, ?, '2024-01-01', '09:30:00', ?, ?)`,
  ).run(args.id, args.ticker, args.reason ?? 'T1', args.fetched_at);
}

function insSentiment(
  db: Database.Database,
  args: {
    ticker: string;
    ts: number;
    mentions?: number;
    mentions_24h_ago?: number | null;
    source?: string;
  },
) {
  db.prepare(
    `INSERT INTO sentiment_snapshots (ticker, ts, source, mentions, mentions_24h_ago)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(args.ticker, args.ts, args.source ?? 's', args.mentions ?? 10, args.mentions_24h_ago ?? null);
}

// ---------- asOfEpoch ----------

describe('asOfEpoch', () => {
  it('returns epoch second at 23:59:59 UTC of given date', () => {
    const e = asOfEpoch('2024-01-20');
    expect(new Date(e * 1000).toISOString()).toBe('2024-01-20T23:59:59.000Z');
  });

  it('is deterministic regardless of local timezone of test runner', () => {
    expect(asOfEpoch('2024-01-20')).toBe(asOfEpoch('2024-01-20'));
  });

  it('crosses month boundary correctly (Jan 31 → Feb 1 differ by 86400 s)', () => {
    const jan31 = asOfEpoch('2024-01-31');
    const feb1 = asOfEpoch('2024-02-01');
    expect(feb1 - jan31).toBe(86400);
  });
});

// ---------- lookbackEpoch ----------

describe('lookbackEpoch', () => {
  it('returns epoch second at 00:00:00 UTC of (date - lookbackDays)', () => {
    const e = lookbackEpoch('2024-01-20', 5);
    expect(new Date(e * 1000).toISOString()).toBe('2024-01-15T00:00:00.000Z');
  });

  it('with lookback=0 returns the same calendar day at 00:00:00 UTC', () => {
    const e = lookbackEpoch('2024-01-20', 0);
    expect(new Date(e * 1000).toISOString()).toBe('2024-01-20T00:00:00.000Z');
  });

  it('crosses month boundary backward correctly', () => {
    const e = lookbackEpoch('2024-02-01', 1);
    expect(new Date(e * 1000).toISOString()).toBe('2024-01-31T00:00:00.000Z');
  });

  it('lookback=0 lower vs asOfEpoch upper on the same day differs by 86399 s', () => {
    const lower = lookbackEpoch('2024-01-20', 0);
    const upper = asOfEpoch('2024-01-20');
    expect(upper - lower).toBe(86399);
  });
});

// ---------- readCandlesAsOf ----------

const CANDLES_NAME = 'asof-candles';
describe('readCandlesAsOf', () => {
  afterAll(() => cleanupTestDb(CANDLES_NAME));

  it('returns empty array on empty table', () => {
    const db = makeTestDb(CANDLES_NAME);
    expect(readCandlesAsOf(db, '2024-01-20', 5)).toEqual([]);
  });

  it('includes candle dated EXACTLY as-of (inclusive upper)', () => {
    const db = makeTestDb(CANDLES_NAME);
    insCandle(db, 'AAPL', '2024-01-20');
    const rows = readCandlesAsOf(db, '2024-01-20', 5);
    expect(rows).toHaveLength(1);
    expect(rows[0].date).toBe('2024-01-20');
  });

  it('excludes candles AFTER as-of date (no future data)', () => {
    const db = makeTestDb(CANDLES_NAME);
    insCandle(db, 'AAPL', '2024-01-19');
    insCandle(db, 'AAPL', '2024-01-21');
    insCandle(db, 'AAPL', '2024-01-25');
    const rows = readCandlesAsOf(db, '2024-01-20', 5);
    expect(rows).toHaveLength(1);
    expect(rows[0].date).toBe('2024-01-19');
  });

  it('window extends asOfDate - (lookbackDays + 1) days backward (boundary inclusive)', () => {
    // lookbackDays=5 ⇒ fromDate = '2024-01-14' (20 - 5 - 1 = 14)
    const db = makeTestDb(CANDLES_NAME);
    insCandle(db, 'AAPL', '2024-01-13'); // outside
    insCandle(db, 'AAPL', '2024-01-14'); // boundary (inclusive)
    insCandle(db, 'AAPL', '2024-01-20'); // asOf (inclusive)
    const dates = readCandlesAsOf(db, '2024-01-20', 5)
      .map(r => r.date)
      .sort();
    expect(dates).toEqual(['2024-01-14', '2024-01-20']);
  });

  it('filters by ticker list when provided', () => {
    const db = makeTestDb(CANDLES_NAME);
    insCandle(db, 'AAPL', '2024-01-20');
    insCandle(db, 'MSFT', '2024-01-20');
    insCandle(db, 'NVDA', '2024-01-20');
    const rows = readCandlesAsOf(db, '2024-01-20', 5, ['AAPL', 'NVDA']);
    expect(rows.map(r => r.ticker).sort()).toEqual(['AAPL', 'NVDA']);
  });

  it('returns all tickers when tickers argument is undefined', () => {
    const db = makeTestDb(CANDLES_NAME);
    insCandle(db, 'AAPL', '2024-01-20');
    insCandle(db, 'MSFT', '2024-01-20');
    expect(
      readCandlesAsOf(db, '2024-01-20', 5)
        .map(r => r.ticker)
        .sort(),
    ).toEqual(['AAPL', 'MSFT']);
  });

  it('treats empty tickers array as "no filter" (codifies current behavior)', () => {
    const db = makeTestDb(CANDLES_NAME);
    insCandle(db, 'AAPL', '2024-01-20');
    insCandle(db, 'MSFT', '2024-01-20');
    // Implementation: `if (tickers && tickers.length > 0)` ⇒ empty array falls through
    // to the no-filter branch and returns all rows. Documenting that.
    expect(readCandlesAsOf(db, '2024-01-20', 5, []).length).toBe(2);
  });
});

// ---------- readInsiderAsOf ----------

const INSIDER_NAME = 'asof-insider';
describe('readInsiderAsOf', () => {
  afterAll(() => cleanupTestDb(INSIDER_NAME));

  it('returns empty array on empty table', () => {
    const db = makeTestDb(INSIDER_NAME);
    expect(readInsiderAsOf(db, '2024-01-20', 30)).toEqual([]);
  });

  it('excludes rows with filed_at strictly AFTER asOfEpoch (no future data)', () => {
    const db = makeTestDb(INSIDER_NAME);
    insInsider(db, { id: 'a', ticker: 'PLTR', filed_at: asOfEpoch('2024-01-20') + 1 });
    expect(readInsiderAsOf(db, '2024-01-20', 30)).toHaveLength(0);
  });

  it('INCLUDES row with filed_at EXACTLY at asOfEpoch (upper bound inclusive)', () => {
    const db = makeTestDb(INSIDER_NAME);
    insInsider(db, { id: 'a', ticker: 'PLTR', filed_at: asOfEpoch('2024-01-20') });
    expect(readInsiderAsOf(db, '2024-01-20', 30)).toHaveLength(1);
  });

  it('INCLUDES row with filed_at EXACTLY at lookbackEpoch (lower bound inclusive)', () => {
    const db = makeTestDb(INSIDER_NAME);
    insInsider(db, { id: 'a', ticker: 'PLTR', filed_at: lookbackEpoch('2024-01-20', 30) });
    expect(readInsiderAsOf(db, '2024-01-20', 30)).toHaveLength(1);
  });

  it('excludes rows with filed_at strictly BEFORE lookbackEpoch', () => {
    const db = makeTestDb(INSIDER_NAME);
    insInsider(db, { id: 'a', ticker: 'PLTR', filed_at: lookbackEpoch('2024-01-20', 30) - 1 });
    expect(readInsiderAsOf(db, '2024-01-20', 30)).toHaveLength(0);
  });

  it('returns multiple rows for the same ticker within window', () => {
    const db = makeTestDb(INSIDER_NAME);
    insInsider(db, { id: 'a', ticker: 'PLTR', insider: 'A', filed_at: ts('2024-01-10') });
    insInsider(db, { id: 'b', ticker: 'PLTR', insider: 'B', filed_at: ts('2024-01-15') });
    expect(readInsiderAsOf(db, '2024-01-20', 30)).toHaveLength(2);
  });

  it('filters by ticker list', () => {
    const db = makeTestDb(INSIDER_NAME);
    insInsider(db, { id: 'a', ticker: 'PLTR', filed_at: ts('2024-01-15') });
    insInsider(db, { id: 'b', ticker: 'AAPL', filed_at: ts('2024-01-15') });
    insInsider(db, { id: 'c', ticker: 'MSFT', filed_at: ts('2024-01-15') });
    const tickers = readInsiderAsOf(db, '2024-01-20', 30, ['PLTR', 'MSFT'])
      .map(r => r.ticker)
      .sort();
    expect(tickers).toEqual(['MSFT', 'PLTR']);
  });

  it('returns the queried column fields verbatim', () => {
    const db = makeTestDb(INSIDER_NAME);
    insInsider(db, { id: 'a', ticker: 'PLTR', insider: 'Cook', code: 'S', filed_at: ts('2024-01-15') });
    const r = readInsiderAsOf(db, '2024-01-20', 30)[0];
    expect(r).toMatchObject({
      ticker: 'PLTR',
      insider_name: 'Cook',
      code: 'S',
      is_derivative: 0,
      filed_at: ts('2024-01-15'),
    });
  });
});

// ---------- readCongressAsOf ----------

const CONGRESS_NAME = 'asof-congress';
describe('readCongressAsOf', () => {
  afterAll(() => cleanupTestDb(CONGRESS_NAME));

  it('returns empty array on empty table', () => {
    const db = makeTestDb(CONGRESS_NAME);
    expect(readCongressAsOf(db, '2024-01-20', 60)).toEqual([]);
  });

  it('excludes rows with disclosed_at strictly AFTER asOfEpoch', () => {
    const db = makeTestDb(CONGRESS_NAME);
    insCongress(db, { id: 'a', ticker: 'NVDA', disclosed_at: asOfEpoch('2024-01-20') + 1 });
    expect(readCongressAsOf(db, '2024-01-20', 60)).toHaveLength(0);
  });

  it('INCLUDES rows with disclosed_at == asOfEpoch (upper bound inclusive)', () => {
    const db = makeTestDb(CONGRESS_NAME);
    insCongress(db, { id: 'a', ticker: 'NVDA', disclosed_at: asOfEpoch('2024-01-20') });
    expect(readCongressAsOf(db, '2024-01-20', 60)).toHaveLength(1);
  });

  it('filters by ticker list', () => {
    const db = makeTestDb(CONGRESS_NAME);
    insCongress(db, { id: 'a', ticker: 'NVDA', disclosed_at: ts('2024-01-10') });
    insCongress(db, { id: 'b', ticker: 'AMD', disclosed_at: ts('2024-01-10') });
    expect(readCongressAsOf(db, '2024-01-20', 60, ['NVDA']).map(r => r.ticker)).toEqual(['NVDA']);
  });
});

// ---------- readFundsAsOf ----------

const FUNDS_NAME = 'asof-funds';
describe('readFundsAsOf', () => {
  afterAll(() => cleanupTestDb(FUNDS_NAME));

  it('returns empty array on empty table', () => {
    const db = makeTestDb(FUNDS_NAME);
    expect(readFundsAsOf(db, '2024-01-20')).toEqual([]);
  });

  it('excludes rows with filed_at strictly AFTER asOfEpoch (no future data)', () => {
    const db = makeTestDb(FUNDS_NAME);
    insFund(db, { accession: 'a', cik: '1', ticker: 'NVDA', filed_at: asOfEpoch('2024-01-20') + 1 });
    expect(readFundsAsOf(db, '2024-01-20')).toHaveLength(0);
  });

  it('INCLUDES row with filed_at == asOfEpoch (upper bound inclusive)', () => {
    const db = makeTestDb(FUNDS_NAME);
    insFund(db, { accession: 'a', cik: '1', ticker: 'NVDA', filed_at: asOfEpoch('2024-01-20') });
    expect(readFundsAsOf(db, '2024-01-20')).toHaveLength(1);
  });

  it('HAS NO LOWER BOUND — arbitrarily old filings are still included', () => {
    // Distinct from every other reader: codifies the long-horizon nature of 13F holdings.
    const db = makeTestDb(FUNDS_NAME);
    insFund(db, { accession: 'a', cik: '1', ticker: 'NVDA', filed_at: ts('2020-01-01') });
    insFund(db, { accession: 'b', cik: '1', ticker: 'NVDA', filed_at: ts('2024-01-15') });
    expect(readFundsAsOf(db, '2024-01-20')).toHaveLength(2);
  });

  it('filters by ticker list', () => {
    const db = makeTestDb(FUNDS_NAME);
    insFund(db, { accession: 'a', cik: '1', ticker: 'NVDA', filed_at: ts('2024-01-10') });
    insFund(db, { accession: 'b', cik: '1', ticker: 'AMD', filed_at: ts('2024-01-10') });
    expect(readFundsAsOf(db, '2024-01-20', ['NVDA']).map(r => r.ticker)).toEqual(['NVDA']);
  });

  it('returns delta_shares unchanged including NULLs', () => {
    const db = makeTestDb(FUNDS_NAME);
    insFund(db, {
      accession: 'a',
      cik: '1',
      ticker: 'NVDA',
      filed_at: ts('2024-01-10'),
      delta_shares: 500,
    });
    insFund(db, { accession: 'b', cik: '1', ticker: 'AMD', filed_at: ts('2024-01-10') });
    const rows = readFundsAsOf(db, '2024-01-20');
    const byTicker = new Map(rows.map(r => [r.ticker, r.delta_shares]));
    expect(byTicker.get('NVDA')).toBe(500);
    expect(byTicker.get('AMD')).toBeNull();
  });
});

// ---------- readHaltsAsOf ----------

const HALTS_NAME = 'asof-halts';
describe('readHaltsAsOf', () => {
  afterAll(() => cleanupTestDb(HALTS_NAME));

  it('returns empty array on empty table', () => {
    const db = makeTestDb(HALTS_NAME);
    expect(readHaltsAsOf(db, '2024-01-20', 5)).toEqual([]);
  });

  it('excludes halts with fetched_at strictly AFTER asOfEpoch', () => {
    const db = makeTestDb(HALTS_NAME);
    insHalt(db, { id: 'a', ticker: 'XYZ', fetched_at: asOfEpoch('2024-01-20') + 1 });
    expect(readHaltsAsOf(db, '2024-01-20', 5)).toHaveLength(0);
  });

  it('includes halts within window for multiple tickers', () => {
    const db = makeTestDb(HALTS_NAME);
    insHalt(db, { id: 'a', ticker: 'XYZ', fetched_at: ts('2024-01-18') });
    insHalt(db, { id: 'b', ticker: 'ABC', fetched_at: ts('2024-01-19') });
    expect(readHaltsAsOf(db, '2024-01-20', 5)).toHaveLength(2);
  });

  it('filters by ticker list', () => {
    const db = makeTestDb(HALTS_NAME);
    insHalt(db, { id: 'a', ticker: 'XYZ', fetched_at: ts('2024-01-18') });
    insHalt(db, { id: 'b', ticker: 'ABC', fetched_at: ts('2024-01-19') });
    expect(readHaltsAsOf(db, '2024-01-20', 5, ['XYZ']).map(r => r.ticker)).toEqual(['XYZ']);
  });
});

// ---------- readSentimentAsOf ----------

const SENT_NAME = 'asof-sentiment';
describe('readSentimentAsOf', () => {
  afterAll(() => cleanupTestDb(SENT_NAME));

  it('returns empty array on empty table', () => {
    const db = makeTestDb(SENT_NAME);
    expect(readSentimentAsOf(db, '2024-01-20', 24)).toEqual([]);
  });

  it('lookback parameter is HOURS not days — 1h window excludes 2h-old rows', () => {
    const db = makeTestDb(SENT_NAME);
    const upper = asOfEpoch('2024-01-20');
    insSentiment(db, { ticker: 'GME', ts: upper - 7200 }); // 2h before — outside 1h window
    insSentiment(db, { ticker: 'GME', ts: upper - 1800 }); // 30 min before — inside
    expect(readSentimentAsOf(db, '2024-01-20', 1)).toHaveLength(1);
  });

  it('excludes ts strictly AFTER asOfEpoch', () => {
    const db = makeTestDb(SENT_NAME);
    insSentiment(db, { ticker: 'GME', ts: asOfEpoch('2024-01-20') + 1 });
    expect(readSentimentAsOf(db, '2024-01-20', 24)).toHaveLength(0);
  });

  it('INCLUDES ts == asOfEpoch (upper bound inclusive)', () => {
    const db = makeTestDb(SENT_NAME);
    insSentiment(db, { ticker: 'GME', ts: asOfEpoch('2024-01-20') });
    expect(readSentimentAsOf(db, '2024-01-20', 24)).toHaveLength(1);
  });

  it('filters by ticker list', () => {
    const db = makeTestDb(SENT_NAME);
    insSentiment(db, { ticker: 'GME', ts: ts('2024-01-20') });
    insSentiment(db, { ticker: 'AMC', ts: ts('2024-01-20') });
    expect(readSentimentAsOf(db, '2024-01-20', 24, ['GME']).map(r => r.ticker)).toEqual(['GME']);
  });

  it('returns mentions_24h_ago verbatim including NULLs', () => {
    const db = makeTestDb(SENT_NAME);
    insSentiment(db, { ticker: 'GME', ts: ts('2024-01-20'), mentions: 50, mentions_24h_ago: 30 });
    insSentiment(db, { ticker: 'AMC', ts: ts('2024-01-20'), mentions: 20, mentions_24h_ago: null });
    const rows = readSentimentAsOf(db, '2024-01-20', 24);
    const byTicker = new Map(rows.map(r => [r.ticker, r.mentions_24h_ago]));
    expect(byTicker.get('GME')).toBe(30);
    expect(byTicker.get('AMC')).toBeNull();
  });
});
