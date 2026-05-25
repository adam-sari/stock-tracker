import { describe, it, expect, afterAll } from 'vitest';
import { makeTestDb, cleanupTestDb, ts, readBacktestScores } from './helpers';
import { replaySentiment } from '@/lib/backtest/replay';

const NAME = 'sentiment';

function s(db: any, args: { ticker: string; epoch: number; mentions: number; prior: number | null }) {
  db.prepare(
    `INSERT INTO sentiment_snapshots (ticker, ts, source, mentions, mentions_24h_ago)
     VALUES (?, ?, 'apewisdom', ?, ?)`
  ).run(args.ticker, args.epoch, args.mentions, args.prior);
}

describe('replay — sentiment surge', () => {
  afterAll(() => cleanupTestDb(NAME));

  it('scores a 3x surge within lookback window', () => {
    const db = makeTestDb(NAME);
    s(db, { ticker: 'GME', epoch: ts('2024-01-20') - 3600, mentions: 3000, prior: 1000 });

    replaySentiment(db, { fromDate: '2024-01-20', toDate: '2024-01-20', lookbackHours: 48 });

    expect(readBacktestScores(db, '2024-01-20', 'sentiment').get('GME')!.detail.latestMentions).toBe(3000);
  });

  it('POISONING: snapshots with ts after as-of are ignored', () => {
    const db = makeTestDb(NAME);
    s(db, { ticker: 'GME', epoch: ts('2024-01-21'), mentions: 3000, prior: 1000 });

    replaySentiment(db, { fromDate: '2024-01-20', toDate: '2024-01-20', lookbackHours: 48 });

    expect(readBacktestScores(db, '2024-01-20', 'sentiment').get('GME')).toBeUndefined();
  });

  it('SYMMETRY: adding future snapshots does not change past scores', () => {
    const db = makeTestDb(NAME);
    s(db, { ticker: 'GME', epoch: ts('2024-01-20') - 3600, mentions: 3000, prior: 1000 });

    replaySentiment(db, { fromDate: '2024-01-20', toDate: '2024-01-20', lookbackHours: 48 });
    const before = readBacktestScores(db, '2024-01-20', 'sentiment');

    s(db, { ticker: 'GME', epoch: ts('2024-01-25'), mentions: 99999, prior: 100 });

    replaySentiment(db, { fromDate: '2024-01-20', toDate: '2024-01-20', lookbackHours: 48 });
    const after = readBacktestScores(db, '2024-01-20', 'sentiment');

    expect(after.get('GME')!.score).toBe(before.get('GME')!.score);
    expect(after.get('GME')!.detail.latestMentions).toBe(3000);
  });
});
