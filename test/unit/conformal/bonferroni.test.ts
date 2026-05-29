import { describe, it, expect } from 'vitest';
import { perHorizonAlpha, validateJointCoverage } from '@/lib/conformal/bonferroni';

describe('Bonferroni helpers', () => {
  it('perHorizonAlpha divides joint alpha by number of horizons', () => {
    expect(perHorizonAlpha(0.10, 4)).toBeCloseTo(0.025);
    expect(perHorizonAlpha(0.20, 2)).toBeCloseTo(0.10);
    expect(perHorizonAlpha(0.05, 1)).toBeCloseTo(0.05);
  });

  it('perHorizonAlpha throws on invalid input', () => {
    expect(() => perHorizonAlpha(0.10, 0)).toThrow();
    expect(() => perHorizonAlpha(0.10, -1)).toThrow();
    expect(() => perHorizonAlpha(0, 4)).toThrow();
  });

  it('validateJointCoverage flags miscoverage above target', () => {
    expect(validateJointCoverage([0.92, 0.91, 0.93, 0.90], 0.10)).toBe(true);
    expect(validateJointCoverage([0.92, 0.91, 0.93, 0.85], 0.10)).toBe(false);
  });
});
