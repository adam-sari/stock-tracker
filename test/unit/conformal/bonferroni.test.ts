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

  it('perHorizonAlpha throws on NaN or non-integer k', () => {
    expect(() => perHorizonAlpha(NaN, 4)).toThrow(/finite/i);
    expect(() => perHorizonAlpha(0.10, NaN)).toThrow(/finite/i);
    expect(() => perHorizonAlpha(0.10, 2.7)).toThrow(/integer/i);
  });

  it('validateJointCoverage throws on empty array or invalid alpha', () => {
    expect(() => validateJointCoverage([], 0.10)).toThrow(/non-empty/i);
    expect(() => validateJointCoverage([0.9, 0.9], 0)).toThrow(/jointAlpha/i);
    expect(() => validateJointCoverage([0.9, 0.9], 1.1)).toThrow(/jointAlpha/i);
  });
});
