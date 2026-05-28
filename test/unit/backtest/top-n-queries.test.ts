import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { getDb } from '@/lib/db/connection';
import {
  topByCompositeScore,
  topByMostSignals,
  topByAcceleration,
} from '@/lib/backtest/top-n-queries';
import { makeTestDb } from '@/test/helpers/test-db';

const testDb = makeTestDb('top-n-queries');

function insertScore(date: string, ticker: string, kind: string, score: number) {
  getDb().prepare(
    `INSERT INTO backtest_scores (date, ticker, signal_kind, score, detail_json)
     VALUES (?, ?, ?, ?, '{}')`
  ).run(date, ticker, kind, score);
}

function today(): { d: string } {
  return getDb().prepare(`SELECT date('now') AS d`).get() as { d: string };
}

describe('topByCompositeScore', () => {
  beforeEach(testDb.reset);
  afterAll(testDb.teardown);

  it('sums scores per ticker within the lookback window, sorts DESC', () => {
    const { d } = today();
    insertScore(d, 'AAPL', 'insider', 0.8);
    insertScore(d, 'AAPL', 'volume', 0.5);
    insertScore(d, 'NVDA', 'insider', 0.9);
    insertScore('2020-01-01', 'STALE', 'insider', 1.0);
    const rows = topByCompositeScore(getDb(), 7, 10);
    expect(rows[0]).toMatchObject({ ticker: 'AAPL' });
    expect(rows[0].value).toBeCloseTo(1.3, 6);
    expect(rows[1]).toMatchObject({ ticker: 'NVDA' });
    expect(rows[1].value).toBeCloseTo(0.9, 6);
    expect(rows.find(r => r.ticker === 'STALE')).toBeUndefined();
  });

  it('respects the n limit', () => {
    const { d } = today();
    for (let i = 0; i < 20; i++) {
      insertScore(d, `T${i}`, 'insider', i * 0.05);
    }
    const rows = topByCompositeScore(getDb(), 7, 5);
    expect(rows).toHaveLength(5);
  });

  it('returns empty array on empty DB', () => {
    expect(topByCompositeScore(getDb(), 7, 10)).toEqual([]);
  });
});

describe('topByMostSignals', () => {
  beforeEach(testDb.reset);
  afterAll(testDb.teardown);

  it('counts distinct signal_kinds per ticker with score > 0', () => {
    const { d } = today();
    insertScore(d, 'AAPL', 'insider', 0.5);
    insertScore(d, 'AAPL', 'volume', 0.3);
    insertScore(d, 'AAPL', 'funds',  0.2);
    insertScore(d, 'NVDA', 'insider', 0.4);
    insertScore(d, 'ZERO', 'volume', 0.0);
    const rows = topByMostSignals(getDb(), 7, 10);
    expect(rows[0]).toMatchObject({ ticker: 'AAPL', value: 3 });
    expect(rows.find(r => r.ticker === 'NVDA')?.value).toBe(1);
    expect(rows.find(r => r.ticker === 'ZERO')).toBeUndefined();
  });

  it('returns empty array on empty DB', () => {
    expect(topByMostSignals(getDb(), 7, 10)).toEqual([]);
  });
});

describe('topByAcceleration', () => {
  beforeEach(testDb.reset);
  afterAll(testDb.teardown);

  it('returns (sum_last_7 - sum_prior_7) per ticker, sorts DESC', () => {
    const db = getDb();
    const offsetDate = (offset: number) =>
      (db.prepare(`SELECT date('now', ? || ' day') AS d`).get(offset.toString()) as { d: string }).d;

    insertScore(offsetDate(-10), 'ACCEL', 'insider', 0.1);
    insertScore(offsetDate(-3),  'ACCEL', 'insider', 0.8);

    insertScore(offsetDate(-10), 'DECEL', 'insider', 0.8);
    insertScore(offsetDate(-3),  'DECEL', 'insider', 0.1);

    insertScore(offsetDate(-10), 'FLAT', 'insider', 0.5);
    insertScore(offsetDate(-3),  'FLAT', 'insider', 0.5);

    const rows = topByAcceleration(db, 7, 10);
    const accel = rows.find(r => r.ticker === 'ACCEL');
    const decel = rows.find(r => r.ticker === 'DECEL');
    const flat = rows.find(r => r.ticker === 'FLAT');

    expect(accel?.value).toBeCloseTo(0.7, 6);
    expect(decel?.value).toBeCloseTo(-0.7, 6);
    expect(flat?.value).toBeCloseTo(0.0, 6);
    expect(rows[0].ticker).toBe('ACCEL');
  });

  it('returns empty array on empty DB', () => {
    expect(topByAcceleration(getDb(), 7, 10)).toEqual([]);
  });
});
