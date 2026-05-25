import { describe, it, expect, afterAll } from 'vitest';
import { makeTestDb, cleanupTestDb, ts, readBacktestScores } from './helpers';
import { replayHalts } from '@/lib/backtest/replay';

const NAME = 'halts';

function h(db: any, args: { id: string; ticker: string; reason?: string; fetched_at: number }) {
  db.prepare(
    `INSERT INTO trading_halts (id, ticker, halt_date, halt_time, reason_code, market, fetched_at)
     VALUES (?, ?, '2024-01-01', '10:00:00', ?, 'NASDAQ', ?)`
  ).run(args.id, args.ticker, args.reason ?? 'LUDP', args.fetched_at);
}

describe('replay — trading halts', () => {
  afterAll(() => cleanupTestDb(NAME));

  it('flags any halt within lookback window', () => {
    const db = makeTestDb(NAME);
    h(db, { id: 'a', ticker: 'ASRT', fetched_at: ts('2024-01-19') });

    replayHalts(db, { fromDate: '2024-01-20', toDate: '2024-01-20', lookbackDays: 3 });

    expect(readBacktestScores(db, '2024-01-20', 'halts').get('ASRT')!.score).toBe(1.0);
  });

  it('POISONING: halts fetched after as-of date are ignored', () => {
    const db = makeTestDb(NAME);
    h(db, { id: 'a', ticker: 'ASRT', fetched_at: ts('2024-01-21') });

    replayHalts(db, { fromDate: '2024-01-20', toDate: '2024-01-20', lookbackDays: 3 });

    expect(readBacktestScores(db, '2024-01-20', 'halts').get('ASRT')).toBeUndefined();
  });

  it('SYMMETRY: adding future halts does not change past scores', () => {
    const db = makeTestDb(NAME);
    h(db, { id: 'a', ticker: 'ASRT', fetched_at: ts('2024-01-19') });

    replayHalts(db, { fromDate: '2024-01-20', toDate: '2024-01-20', lookbackDays: 3 });
    const before = readBacktestScores(db, '2024-01-20', 'halts');

    h(db, { id: 'b', ticker: 'ASRT', fetched_at: ts('2024-01-25') });

    replayHalts(db, { fromDate: '2024-01-20', toDate: '2024-01-20', lookbackDays: 3 });
    const after = readBacktestScores(db, '2024-01-20', 'halts');

    expect(after.get('ASRT')!.score).toBe(before.get('ASRT')!.score);
  });
});
