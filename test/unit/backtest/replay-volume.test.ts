import { describe, it, expect, afterAll } from 'vitest';
import { makeTestDb, cleanupTestDb, ts, readBacktestScores } from './helpers';
import { replayVolume } from '@/lib/backtest/replay';

const NAME = 'volume';

describe('replay — volume breakout', () => {
  afterAll(() => cleanupTestDb(NAME));

  function insertCandle(db: any, ticker: string, date: string, volume: number) {
    db.prepare(
      `INSERT INTO candles_daily (ticker, date, open, high, low, close, volume, source)
       VALUES (?, ?, 100, 100, 100, 100, ?, 'test')`
    ).run(ticker, date, volume);
  }

  it('writes a score on a day with a 3x volume spike vs 30-day average', () => {
    const db = makeTestDb(NAME);
    for (let i = 0; i < 30; i++) {
      const d = new Date('2024-01-01T00:00:00Z'); d.setUTCDate(d.getUTCDate() + i);
      insertCandle(db, 'AAPL', d.toISOString().slice(0, 10), 1_000_000);
    }
    insertCandle(db, 'AAPL', '2024-01-31', 3_000_000);

    replayVolume(db, { fromDate: '2024-01-31', toDate: '2024-01-31', lookbackDays: 30 });

    const scores = readBacktestScores(db, '2024-01-31', 'volume');
    expect(scores.get('AAPL')).toBeTruthy();
    expect(scores.get('AAPL')!.score).toBeGreaterThan(0);
    expect(scores.get('AAPL')!.detail.latestVolume).toBe(3_000_000);
  });

  it('POISONING: candles dated AFTER the as-of date are ignored', () => {
    const db = makeTestDb(NAME);
    for (let i = 0; i < 30; i++) {
      const d = new Date('2024-01-01T00:00:00Z'); d.setUTCDate(d.getUTCDate() + i);
      insertCandle(db, 'AAPL', d.toISOString().slice(0, 10), 1_000_000);
    }
    insertCandle(db, 'AAPL', '2024-01-31', 3_000_000);

    replayVolume(db, { fromDate: '2024-01-30', toDate: '2024-01-30', lookbackDays: 30 });

    const scores = readBacktestScores(db, '2024-01-30', 'volume');
    expect(scores.get('AAPL')).toBeUndefined();
  });

  it('SYMMETRY: adding future candles does not change a past score', () => {
    const dbA = makeTestDb(NAME);
    for (let i = 0; i < 30; i++) {
      const d = new Date('2024-01-01T00:00:00Z'); d.setUTCDate(d.getUTCDate() + i);
      insertCandle(dbA, 'AAPL', d.toISOString().slice(0, 10), 1_000_000);
    }
    insertCandle(dbA, 'AAPL', '2024-01-31', 3_000_000);
    replayVolume(dbA, { fromDate: '2024-01-31', toDate: '2024-01-31', lookbackDays: 30 });
    const before = readBacktestScores(dbA, '2024-01-31', 'volume');

    insertCandle(dbA, 'AAPL', '2024-02-15', 100_000_000);
    replayVolume(dbA, { fromDate: '2024-01-31', toDate: '2024-01-31', lookbackDays: 30 });
    const after = readBacktestScores(dbA, '2024-01-31', 'volume');

    expect(after.get('AAPL')!.score).toBe(before.get('AAPL')!.score);
    expect(after.get('AAPL')!.detail.latestVolume).toBe(before.get('AAPL')!.detail.latestVolume);
  });
});
