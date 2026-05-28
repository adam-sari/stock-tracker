import { describe, it, expect } from 'vitest';
import { computeMeanWeights } from '@/scripts/regen-learned-weights';
import type { WeightWindow } from '@/lib/backtest/weights-reader';

function w(overrides: Partial<WeightWindow['weights']>): WeightWindow {
  const base = { insider: 0, congress: 0, funds: 0, halts: 0, volume: 0, sentiment: 0 };
  return {
    train_start: '2024-01-01', train_end: '2024-10-01',
    test_start: '2024-11-01', test_end: '2024-12-01',
    weights: { ...base, ...overrides },
    alpha_selected: null,
    oos_ic_learned: 0, oos_ic_production: 0, oos_ic_backtest: null,
    n_train: 100, n_test: 20,
  };
}

describe('computeMeanWeights', () => {
  it('averages weights across the most-recent N windows', () => {
    const windows = [w({ insider: 0.4, volume: 0.3, sentiment: 0.2 }), w({ insider: 0.5, volume: 0.3, sentiment: 0.2 })];
    const out = computeMeanWeights(windows, 2);
    expect(out.insider).toBeCloseTo(0.45, 6);
    expect(out.volume).toBeCloseTo(0.3, 6);
    expect(out.sentiment).toBeCloseTo(0.2, 6);
    expect(out.halts).toBeCloseTo(0, 6);
  });

  it('uses only the most-recent N windows when more exist', () => {
    const windows = [
      w({ insider: 0.0 }), // ignored
      w({ insider: 0.4 }),
      w({ insider: 0.6 }),
    ];
    const out = computeMeanWeights(windows, 2);
    expect(out.insider).toBeCloseTo(0.5, 6);
  });

  it('handles fewer windows than recentN', () => {
    const windows = [w({ insider: 0.5 })];
    const out = computeMeanWeights(windows, 8);
    expect(out.insider).toBeCloseTo(0.5, 6);
  });

  it('returns zero weights for an empty windows list', () => {
    const out = computeMeanWeights([], 8);
    expect(out.insider).toBe(0);
    expect(out.volume).toBe(0);
  });
});
