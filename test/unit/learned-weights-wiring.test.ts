/**
 * Plan 0004 v0 — Task 5: USE_LEARNED_WEIGHTS flag wiring into discovery.ts.
 *
 * Verifies `getActiveWeights()` returns DEFAULT_WEIGHTS by default and LEARNED_WEIGHTS
 * when the env flag is set. The flag default is OFF so production behavior is unchanged
 * until Adam explicitly opts in.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DEFAULT_WEIGHTS, getActiveWeights } from '@/lib/computations/discovery';
import { LEARNED_WEIGHTS } from '@/lib/computations/learned-weights';

describe('getActiveWeights (Plan 0004 v0 wiring)', () => {
  const originalFlag = process.env.USE_LEARNED_WEIGHTS;

  beforeEach(() => {
    delete process.env.USE_LEARNED_WEIGHTS;
  });

  afterEach(() => {
    if (originalFlag === undefined) {
      delete process.env.USE_LEARNED_WEIGHTS;
    } else {
      process.env.USE_LEARNED_WEIGHTS = originalFlag;
    }
  });

  it('returns DEFAULT_WEIGHTS when USE_LEARNED_WEIGHTS is unset', () => {
    expect(getActiveWeights()).toBe(DEFAULT_WEIGHTS);
  });

  it('returns DEFAULT_WEIGHTS when USE_LEARNED_WEIGHTS is "" (empty string)', () => {
    process.env.USE_LEARNED_WEIGHTS = '';
    expect(getActiveWeights()).toBe(DEFAULT_WEIGHTS);
  });

  it('returns DEFAULT_WEIGHTS when USE_LEARNED_WEIGHTS is "0"', () => {
    process.env.USE_LEARNED_WEIGHTS = '0';
    expect(getActiveWeights()).toBe(DEFAULT_WEIGHTS);
  });

  it('returns LEARNED_WEIGHTS when USE_LEARNED_WEIGHTS is "1"', () => {
    process.env.USE_LEARNED_WEIGHTS = '1';
    expect(getActiveWeights()).toBe(LEARNED_WEIGHTS);
  });
});
