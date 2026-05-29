/**
 * Bonferroni-corrected per-horizon alpha. To advertise joint (1 - alpha)
 * coverage across k horizons, each horizon must be conformalized at alpha / k.
 */
export function perHorizonAlpha(jointAlpha: number, k: number): number {
  if (k <= 0) throw new Error(`k must be > 0 (got ${k})`);
  if (jointAlpha <= 0 || jointAlpha >= 1) {
    throw new Error(`jointAlpha must be in (0, 1) (got ${jointAlpha})`);
  }
  return jointAlpha / k;
}

/**
 * True iff every per-horizon coverage is at least (1 - jointAlpha).
 */
export function validateJointCoverage(coverages: number[], jointAlpha: number): boolean {
  const target = 1 - jointAlpha;
  return coverages.every(c => c >= target);
}
