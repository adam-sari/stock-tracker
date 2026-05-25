import { describe, it, expect, afterAll } from 'vitest';
import * as fc from 'fast-check';
import { makeTestDb, cleanupTestDb, readBacktestScores } from './helpers';
import { replayAllSignals } from '@/lib/backtest/replay';

const NAME = 'orchestrator';

describe('replayAllSignals orchestrator', () => {
  afterAll(() => cleanupTestDb(NAME));

  it('writes a backtest_runs row with status=ok and the git SHA', async () => {
    const db = makeTestDb(NAME);
    // Seed enough volume data so at least one signal scores
    db.prepare(
      `INSERT INTO candles_daily (ticker, date, open, high, low, close, volume, source)
       VALUES ('AAPL', '2024-01-31', 100, 100, 100, 100, 3000000, 'test')`
    ).run();
    for (let i = 0; i < 30; i++) {
      const d = new Date('2024-01-01T00:00:00Z'); d.setUTCDate(d.getUTCDate() + i);
      db.prepare(
        `INSERT INTO candles_daily (ticker, date, open, high, low, close, volume, source)
         VALUES ('AAPL', ?, 100, 100, 100, 100, 1000000, 'test')`
      ).run(d.toISOString().slice(0, 10));
    }

    const result = await replayAllSignals(db, { fromDate: '2024-01-31', toDate: '2024-01-31' });

    expect(result.runId).toBeGreaterThan(0);
    const run = db.prepare('SELECT * FROM backtest_runs WHERE id = ?').get(result.runId) as any;
    expect(run.status).toBe('ok');
    expect(run.scoring_git_sha).toMatch(/^[0-9a-f]{7,40}$|^unknown$/);
  });

  it('FUZZ: no scored detail contains data with timestamp > as-of date', async () => {
    await fc.assert(fc.asyncProperty(
      fc.date({ min: new Date('2023-01-01'), max: new Date('2024-12-31') }),
      fc.integer({ min: 1, max: 20 }),
      async (asOfDateObj, daysOfData) => {
        const db = makeTestDb(NAME);
        const asOf = asOfDateObj.toISOString().slice(0, 10);
        for (let i = 0; i < daysOfData; i++) {
          const off = i - Math.floor(daysOfData / 2);
          const d = new Date(asOfDateObj); d.setUTCDate(d.getUTCDate() + off);
          db.prepare(
            `INSERT INTO insider_txns (id, ticker, insider_name, code, is_derivative, shares, txn_date, filed_at, source)
             VALUES (?, 'AAPL', ?, 'P', 0, 100, ?, ?, 'test')`
          ).run(`fuzz-${i}`, `insider-${i}`, d.toISOString().slice(0, 10), Math.floor(d.getTime() / 1000));
        }
        await replayAllSignals(db, { fromDate: asOf, toDate: asOf, signals: ['insider'] });
        const scores = readBacktestScores(db, asOf, 'insider');
        const upperEpoch = Math.floor(new Date(`${asOf}T23:59:59Z`).getTime() / 1000);
        const visible = db.prepare(
          'SELECT COUNT(DISTINCT insider_name) AS n FROM insider_txns WHERE filed_at <= ?'
        ).get(upperEpoch) as { n: number };
        const entry = scores.get('AAPL');
        if (entry) {
          expect(entry.detail.distinctBuyers).toBeLessThanOrEqual(visible.n);
        }
        return true;
      },
    ), { numRuns: 20 });
  });
});
