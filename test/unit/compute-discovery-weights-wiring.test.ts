/**
 * Plan 0004 v0 — Bug 2 from integration review.
 *
 * `getActiveWeights()` and the USE_LEARNED_WEIGHTS flag exist in
 * lib/computations/discovery, but compute-discovery.ts was wiring
 * DEFAULT_WEIGHTS directly, leaving the flag dead in production.
 * This test pins the call-path: the discovery job MUST consult
 * getActiveWeights() so the flag is honoured.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import * as discoveryModule from '@/lib/computations/discovery';
import { computeDiscoveryOnce } from '@/lib/jobs/compute-discovery';
import { closeDb, getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';

const TEST_DB_DIR = path.join(process.cwd(), '.vitest-cache', 'compute-discovery-weights-wiring');

describe('computeDiscoveryOnce honours USE_LEARNED_WEIGHTS flag', () => {
  const originalFlag = process.env.USE_LEARNED_WEIGHTS;

  beforeEach(() => {
    closeDb();
    if (existsSync(TEST_DB_DIR)) rmSync(TEST_DB_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DB_DIR, { recursive: true });
    process.env.DB_PATH = path.join(TEST_DB_DIR, 'test.db');
    applySchema(getDb());
    delete process.env.USE_LEARNED_WEIGHTS;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalFlag === undefined) delete process.env.USE_LEARNED_WEIGHTS;
    else process.env.USE_LEARNED_WEIGHTS = originalFlag;
  });

  it('calls getActiveWeights() on the discovery code path', async () => {
    const spy = vi.spyOn(discoveryModule, 'getActiveWeights');
    await computeDiscoveryOnce();
    expect(spy).toHaveBeenCalled();
  });
});
