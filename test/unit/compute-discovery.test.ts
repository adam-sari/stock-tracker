import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';
import { createTransaction } from '@/lib/db/queries/transactions';
import { upsertInsiderTxns } from '@/lib/db/queries/insider';
import { upsertCongressTrades, hashCongressTrade } from '@/lib/db/queries/congress';
import { upsertHalts, hashHalt } from '@/lib/db/queries/halts';
import { listDiscoveryTopN } from '@/lib/db/queries/discovery';
import { computeDiscoveryOnce } from '@/lib/jobs/compute-discovery';

const TEST_DB_DIR = path.join(process.cwd(), '.vitest-cache', 'compute-discovery');
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test.db');

describe('computeDiscoveryOnce', () => {
  beforeEach(() => {
    closeDb();
    if (existsSync(TEST_DB_DIR)) rmSync(TEST_DB_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DB_DIR, { recursive: true });
    process.env.DB_PATH = TEST_DB_PATH;
    applySchema(getDb());
  });
  afterAll(() => { closeDb(); rmSync(TEST_DB_DIR, { recursive: true, force: true }); });

  it('aggregates signals and writes discovery_scores', async () => {
    const now = Math.floor(Date.now() / 1000);
    // PLTR: 3 insider buyers in last week (cluster)
    upsertInsiderTxns([
      { id: 'i1', ticker: 'PLTR', insider_name: 'A', code: 'P', is_derivative: 0, shares: 100, txn_date: '2026-05-10', filed_at: now - 3 * 86400, source: 'edgar' },
      { id: 'i2', ticker: 'PLTR', insider_name: 'B', code: 'P', is_derivative: 0, shares: 200, txn_date: '2026-05-11', filed_at: now - 2 * 86400, source: 'edgar' },
      { id: 'i3', ticker: 'PLTR', insider_name: 'C', code: 'P', is_derivative: 0, shares: 50,  txn_date: '2026-05-12', filed_at: now - 1 * 86400, source: 'edgar' },
    ]);
    // ASRT: trade halt
    upsertHalts([
      { id: hashHalt('ASRT', '2026-05-12', '07:55:00'), ticker: 'ASRT', halt_date: '2026-05-12', halt_time: '07:55:00', reason_code: 'LUDP', market: 'NASDAQ', fetched_at: now - 86400 },
    ]);

    const r = await computeDiscoveryOnce();
    expect(r.scored).toBeGreaterThan(0);

    const top = listDiscoveryTopN();
    const pltr = top.find(t => t.ticker === 'PLTR');
    expect(pltr).toBeTruthy();
    expect(pltr!.score).toBeGreaterThan(0);
    const signals = JSON.parse(pltr!.signals_json);
    expect(signals.find((s: any) => s.kind === 'insider')).toBeTruthy();

    const asrt = top.find(t => t.ticker === 'ASRT');
    expect(asrt).toBeTruthy();
  });

  it('excludes tickers in the user portfolio', async () => {
    const now = Math.floor(Date.now() / 1000);
    createTransaction({ ticker: 'PLTR', kind: 'buy', qty: 10, price: 24, executed_at: '2026-01-01T14:30:00Z' });
    upsertInsiderTxns([
      { id: 'i1', ticker: 'PLTR', insider_name: 'A', code: 'P', is_derivative: 0, shares: 100, txn_date: '2026-05-10', filed_at: now - 3 * 86400, source: 'edgar' },
      { id: 'i2', ticker: 'PLTR', insider_name: 'B', code: 'P', is_derivative: 0, shares: 200, txn_date: '2026-05-11', filed_at: now - 2 * 86400, source: 'edgar' },
    ]);
    await computeDiscoveryOnce();
    const top = listDiscoveryTopN();
    expect(top.find(t => t.ticker === 'PLTR')).toBeUndefined();
  });

  it('records job_runs entry with status ok', async () => {
    await computeDiscoveryOnce();
    const job = getDb().prepare(`SELECT status FROM job_runs WHERE job='compute_discovery' ORDER BY id DESC LIMIT 1`).get() as { status: string };
    expect(job.status).toBe('ok');
  });
});
