import { describe, it, expect, afterAll } from 'vitest';
import { makeTestDb, cleanupTestDb, ts, readBacktestScores } from './helpers';
import { replayInsider } from '@/lib/backtest/replay';

const NAME = 'insider';

function ins(db: any, args: { id: string; ticker: string; insider: string; code?: string; deriv?: number; filed_at: number; txn_date?: string }) {
  db.prepare(
    `INSERT INTO insider_txns (id, ticker, insider_name, code, is_derivative, shares, txn_date, filed_at, source)
     VALUES (?, ?, ?, ?, ?, 100, ?, ?, 'test')`
  ).run(args.id, args.ticker, args.insider, args.code ?? 'P', args.deriv ?? 0, args.txn_date ?? '2024-01-01', args.filed_at);
}

describe('replay — insider clusters', () => {
  afterAll(() => cleanupTestDb(NAME));

  it('writes a score on a day with 3 distinct insider buyers in 30-day window', () => {
    const db = makeTestDb(NAME);
    ins(db, { id: 'a', ticker: 'PLTR', insider: 'A', filed_at: ts('2024-01-10') });
    ins(db, { id: 'b', ticker: 'PLTR', insider: 'B', filed_at: ts('2024-01-15') });
    ins(db, { id: 'c', ticker: 'PLTR', insider: 'C', filed_at: ts('2024-01-20') });

    replayInsider(db, { fromDate: '2024-01-25', toDate: '2024-01-25', lookbackDays: 30 });

    const scores = readBacktestScores(db, '2024-01-25', 'insider');
    expect(scores.get('PLTR')).toBeTruthy();
    expect(scores.get('PLTR')!.detail.distinctBuyers).toBe(3);
  });

  it('POISONING: filings with filed_at AFTER the as-of date are ignored', () => {
    const db = makeTestDb(NAME);
    ins(db, { id: 'a', ticker: 'PLTR', insider: 'A', filed_at: ts('2024-01-10') });
    ins(db, { id: 'b', ticker: 'PLTR', insider: 'B', filed_at: ts('2024-01-25') });
    ins(db, { id: 'c', ticker: 'PLTR', insider: 'C', filed_at: ts('2024-01-26') });

    replayInsider(db, { fromDate: '2024-01-20', toDate: '2024-01-20', lookbackDays: 30 });

    const scores = readBacktestScores(db, '2024-01-20', 'insider');
    expect(scores.get('PLTR')).toBeUndefined();
  });

  it('SYMMETRY: adding future filings does not change a past score', () => {
    const db = makeTestDb(NAME);
    ins(db, { id: 'a', ticker: 'PLTR', insider: 'A', filed_at: ts('2024-01-10') });
    ins(db, { id: 'b', ticker: 'PLTR', insider: 'B', filed_at: ts('2024-01-15') });

    replayInsider(db, { fromDate: '2024-01-20', toDate: '2024-01-20', lookbackDays: 30 });
    const before = readBacktestScores(db, '2024-01-20', 'insider');

    ins(db, { id: 'c', ticker: 'PLTR', insider: 'C', filed_at: ts('2024-01-25') });
    ins(db, { id: 'd', ticker: 'PLTR', insider: 'D', filed_at: ts('2024-01-26') });

    replayInsider(db, { fromDate: '2024-01-20', toDate: '2024-01-20', lookbackDays: 30 });
    const after = readBacktestScores(db, '2024-01-20', 'insider');

    expect(after.get('PLTR')!.score).toBe(before.get('PLTR')!.score);
    expect(after.get('PLTR')!.detail.distinctBuyers).toBe(2);
  });
});
