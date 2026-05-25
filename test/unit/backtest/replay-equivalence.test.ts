import { describe, it, expect, afterAll } from 'vitest';
import { makeTestDb, cleanupTestDb } from './helpers';
import { replayAllSignals } from '@/lib/backtest/replay';
import { computeDiscoveryOnce } from '@/lib/jobs/compute-discovery';
import { upsertInsiderTxns } from '@/lib/db/queries/insider';

const NAME = 'equivalence';

describe('replay equivalence with production scoring', () => {
  afterAll(() => cleanupTestDb(NAME));

  it('replay for today reproduces today\'s production-side per-signal scores', async () => {
    const db = makeTestDb(NAME);
    const now = Math.floor(Date.now() / 1000);
    const today = new Date(now * 1000).toISOString().slice(0, 10);

    upsertInsiderTxns([
      { id: 'i1', ticker: 'PLTR', insider_name: 'A', code: 'P', is_derivative: 0, shares: 100, txn_date: today, filed_at: now - 4 * 86400, source: 'test' },
      { id: 'i2', ticker: 'PLTR', insider_name: 'B', code: 'P', is_derivative: 0, shares: 100, txn_date: today, filed_at: now - 3 * 86400, source: 'test' },
      { id: 'i3', ticker: 'PLTR', insider_name: 'C', code: 'P', is_derivative: 0, shares: 100, txn_date: today, filed_at: now - 2 * 86400, source: 'test' },
    ]);

    await computeDiscoveryOnce();
    const prodRow = db.prepare(
      `SELECT signals_json FROM discovery_scores WHERE ticker = 'PLTR'`
    ).get() as { signals_json: string } | undefined;
    expect(prodRow).toBeTruthy();
    const prodInsider = JSON.parse(prodRow!.signals_json)
      .find((s: any) => s.kind === 'insider');
    expect(prodInsider).toBeTruthy();

    await replayAllSignals(db, { fromDate: today, toDate: today, signals: ['insider'] });
    const replayed = db.prepare(
      `SELECT score, detail_json FROM backtest_scores
       WHERE date = ? AND ticker = 'PLTR' AND signal_kind = 'insider'`
    ).get(today) as { score: number; detail_json: string } | undefined;
    expect(replayed).toBeTruthy();

    expect(Math.abs(replayed!.score - prodInsider.score)).toBeLessThan(1e-9);
    expect(JSON.parse(replayed!.detail_json).distinctBuyers).toBe(3);
  });
});
