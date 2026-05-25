import { describe, it, expect, afterAll } from 'vitest';
import { makeTestDb, cleanupTestDb, ts, readBacktestScores } from './helpers';
import { replayFunds } from '@/lib/backtest/replay';

const NAME = 'funds';

function fh(db: any, args: { acc: string; cik: string; ticker: string; period_end: string; filed_at: number; delta: number }) {
  db.prepare(
    `INSERT INTO fund_holdings (filing_accession, cik, ticker, shares, value_usd, period_end, filed_at, delta_shares)
     VALUES (?, ?, ?, 1000, 100000, ?, ?, ?)`
  ).run(args.acc, args.cik, args.ticker, args.period_end, args.filed_at, args.delta);
}

describe('replay — 13F fund accumulation', () => {
  afterAll(() => cleanupTestDb(NAME));

  it('CRITICAL — uses filed_at, not period_end, for as-of', () => {
    const db = makeTestDb(NAME);
    fh(db, { acc: 'F1', cik: '001', ticker: 'AAPL', period_end: '2024-03-31', filed_at: ts('2024-05-15'), delta: 100 });
    fh(db, { acc: 'F2', cik: '002', ticker: 'AAPL', period_end: '2024-03-31', filed_at: ts('2024-05-15'), delta: 200 });
    fh(db, { acc: 'F3', cik: '003', ticker: 'AAPL', period_end: '2024-03-31', filed_at: ts('2024-05-15'), delta: 300 });

    replayFunds(db, { fromDate: '2024-04-15', toDate: '2024-04-15' });
    expect(readBacktestScores(db, '2024-04-15', 'funds').get('AAPL')).toBeUndefined();

    replayFunds(db, { fromDate: '2024-05-20', toDate: '2024-05-20' });
    expect(readBacktestScores(db, '2024-05-20', 'funds').get('AAPL')!.detail.accumulators).toBe(3);
  });

  it('POISONING: holdings filed after as-of date are ignored', () => {
    const db = makeTestDb(NAME);
    fh(db, { acc: 'F1', cik: '001', ticker: 'AAPL', period_end: '2024-03-31', filed_at: ts('2024-05-15'), delta: 100 });
    fh(db, { acc: 'F2', cik: '002', ticker: 'AAPL', period_end: '2024-03-31', filed_at: ts('2024-05-15'), delta: 200 });
    fh(db, { acc: 'F3', cik: '003', ticker: 'AAPL', period_end: '2024-03-31', filed_at: ts('2024-08-10'), delta: 300 });

    replayFunds(db, { fromDate: '2024-05-20', toDate: '2024-05-20' });
    expect(readBacktestScores(db, '2024-05-20', 'funds').get('AAPL')!.detail.accumulators).toBe(2);
  });

  it('SYMMETRY: adding future filings does not change past scores', () => {
    const db = makeTestDb(NAME);
    fh(db, { acc: 'F1', cik: '001', ticker: 'AAPL', period_end: '2024-03-31', filed_at: ts('2024-05-15'), delta: 100 });
    fh(db, { acc: 'F2', cik: '002', ticker: 'AAPL', period_end: '2024-03-31', filed_at: ts('2024-05-15'), delta: 200 });

    replayFunds(db, { fromDate: '2024-05-20', toDate: '2024-05-20' });
    const before = readBacktestScores(db, '2024-05-20', 'funds');

    fh(db, { acc: 'F3', cik: '003', ticker: 'AAPL', period_end: '2024-06-30', filed_at: ts('2024-08-15'), delta: 500 });

    replayFunds(db, { fromDate: '2024-05-20', toDate: '2024-05-20' });
    const after = readBacktestScores(db, '2024-05-20', 'funds');

    expect(after.get('AAPL')!.score).toBe(before.get('AAPL')!.score);
    expect(after.get('AAPL')!.detail.accumulators).toBe(2);
  });

  it('uses ONLY the most recent visible period for each scoring pass', () => {
    const db = makeTestDb(NAME);
    fh(db, { acc: 'F1Q1', cik: '001', ticker: 'AAPL', period_end: '2024-03-31', filed_at: ts('2024-05-15'), delta: 100 });
    fh(db, { acc: 'F2Q1', cik: '002', ticker: 'AAPL', period_end: '2024-03-31', filed_at: ts('2024-05-15'), delta: 200 });
    fh(db, { acc: 'F1Q2', cik: '001', ticker: 'AAPL', period_end: '2024-06-30', filed_at: ts('2024-08-15'), delta: 50 });
    fh(db, { acc: 'F2Q2', cik: '002', ticker: 'AAPL', period_end: '2024-06-30', filed_at: ts('2024-08-15'), delta: 60 });
    fh(db, { acc: 'F3Q2', cik: '003', ticker: 'AAPL', period_end: '2024-06-30', filed_at: ts('2024-08-15'), delta: 70 });
    fh(db, { acc: 'F4Q2', cik: '004', ticker: 'AAPL', period_end: '2024-06-30', filed_at: ts('2024-08-15'), delta: 80 });

    replayFunds(db, { fromDate: '2024-08-20', toDate: '2024-08-20' });
    expect(readBacktestScores(db, '2024-08-20', 'funds').get('AAPL')!.detail.accumulators).toBe(4);
  });
});
