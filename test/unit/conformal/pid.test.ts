import { describe, it, expect } from 'vitest';
import { applyPidStep, DEFAULT_GAINS } from '@/lib/conformal/pid';
import type { PidState } from '@/lib/conformal/types';

function freshState(): PidState {
  return { q_t: 0, integral: 0, prev_err: 0, updates_count: 0,
           empirical_coverage: null };
}

describe('applyPidStep', () => {
  it('updates q_t toward higher value when miscoverage is positive', () => {
    let state = freshState();
    const alpha = 0.10;
    // Observation that misses: score > q_t
    state = applyPidStep(state, { score: 0.5, alphaTarget: alpha }, DEFAULT_GAINS);
    expect(state.q_t).toBeGreaterThan(0);
    expect(state.updates_count).toBe(1);
  });

  it('drives q_t down when score is below threshold (over-covering)', () => {
    let state: PidState = { q_t: 0.5, integral: 0, prev_err: 0, updates_count: 0,
                            empirical_coverage: null };
    const alpha = 0.10;
    state = applyPidStep(state, { score: 0.1, alphaTarget: alpha }, DEFAULT_GAINS);
    expect(state.q_t).toBeLessThan(0.5);
  });

  it('long-run miscoverage converges near alpha on a stationary stream', () => {
    let state = freshState();
    const alpha = 0.10;
    // Synthetic scores: ~10% exceedance at the equilibrium threshold.
    const seed = 42;
    let s = seed;
    const rand = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    let exceeds = 0;
    const N = 2000;
    for (let i = 0; i < N; i++) {
      const score = rand() < 0.10 ? 1.0 + rand() * 0.5 : rand() * 0.9;
      if (score > state.q_t) exceeds++;
      state = applyPidStep(state, { score, alphaTarget: alpha }, DEFAULT_GAINS);
    }
    const rate = exceeds / N;
    expect(rate).toBeGreaterThan(0.07);
    expect(rate).toBeLessThan(0.13);
  });

  it('maintains rolling-100 empirical_coverage', () => {
    let state = freshState();
    const alpha = 0.10;
    for (let i = 0; i < 150; i++) {
      state = applyPidStep(state, { score: i % 10 === 0 ? 1.5 : 0.1,
                                    alphaTarget: alpha }, DEFAULT_GAINS);
    }
    expect(state.empirical_coverage).not.toBeNull();
    // Coverage = fraction of last 100 where score <= q_t
    // Roughly 90% of observations have low scores → coverage near 0.90
    expect(state.empirical_coverage!).toBeGreaterThan(0.80);
    expect(state.empirical_coverage!).toBeLessThan(1.00);
  });
});
