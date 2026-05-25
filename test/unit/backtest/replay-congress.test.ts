import { describe, it, expect, afterAll } from 'vitest';
import { makeTestDb, cleanupTestDb, ts, readBacktestScores } from './helpers';
import { replayCongress } from '@/lib/backtest/replay';

const NAME = 'congress';

function ct(db: any, args: { id: string; ticker: string; member: string; kind?: string; disclosed_at: number }) {
  db.prepare(
    `INSERT INTO congress_trades (id, ticker, chamber, member, kind, txn_date, disclosed_at, ptr_url, source)
     VALUES (?, ?, 'house', ?, ?, '2024-01-01', ?, '', 'test')`
  ).run(args.id, args.ticker, args.member, args.kind ?? 'Purchase', args.disclosed_at);
}

describe('replay — congress trades', () => {
  afterAll(() => cleanupTestDb(NAME));

  it('writes a score on a day with 2 distinct member purchases in 14-day window', () => {
    const db = makeTestDb(NAME);
    ct(db, { id: 'a', ticker: 'NVDA', member: 'X', disclosed_at: ts('2024-01-15') });
    ct(db, { id: 'b', ticker: 'NVDA', member: 'Y', disclosed_at: ts('2024-01-18') });

    replayCongress(db, { fromDate: '2024-01-20', toDate: '2024-01-20', lookbackDays: 14 });

    const scores = readBacktestScores(db, '2024-01-20', 'congress');
    expect(scores.get('NVDA')).toBeTruthy();
    expect(scores.get('NVDA')!.detail.buys).toBe(2);
  });

  it('POISONING: disclosures after as-of date are ignored', () => {
    const db = makeTestDb(NAME);
    ct(db, { id: 'a', ticker: 'NVDA', member: 'X', disclosed_at: ts('2024-01-15') });
    ct(db, { id: 'b', ticker: 'NVDA', member: 'Y', disclosed_at: ts('2024-01-21') });

    replayCongress(db, { fromDate: '2024-01-20', toDate: '2024-01-20', lookbackDays: 14 });

    const scores = readBacktestScores(db, '2024-01-20', 'congress');
    expect(scores.get('NVDA')!.detail.buys).toBe(1);
  });

  it('SYMMETRY: adding future disclosures does not change past scores', () => {
    const db = makeTestDb(NAME);
    ct(db, { id: 'a', ticker: 'NVDA', member: 'X', disclosed_at: ts('2024-01-15') });
    ct(db, { id: 'b', ticker: 'NVDA', member: 'Y', disclosed_at: ts('2024-01-18') });

    replayCongress(db, { fromDate: '2024-01-20', toDate: '2024-01-20', lookbackDays: 14 });
    const before = readBacktestScores(db, '2024-01-20', 'congress');

    ct(db, { id: 'c', ticker: 'NVDA', member: 'Z', disclosed_at: ts('2024-01-25') });
    replayCongress(db, { fromDate: '2024-01-20', toDate: '2024-01-20', lookbackDays: 14 });
    const after = readBacktestScores(db, '2024-01-20', 'congress');

    expect(after.get('NVDA')!.score).toBe(before.get('NVDA')!.score);
    expect(after.get('NVDA')!.detail.buys).toBe(2);
  });
});
