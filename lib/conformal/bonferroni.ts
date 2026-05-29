/**
 * Bonferroni-corrected per-horizon alpha. To advertise joint (1 - alpha)
 * coverage across k horizons, each horizon must be conformalized at alpha / k.
 */
export function perHorizonAlpha(jointAlpha: number, k: number): number {
  if (!Number.isFinite(jointAlpha) || !Number.isFinite(k)) {
    throw new Error(`jointAlpha and k must be finite (got jointAlpha=${jointAlpha}, k=${k})`);
  }
  if (!Number.isInteger(k) || k <= 0) {
    throw new Error(`k must be a positive integer (got ${k})`);
  }
  if (jointAlpha <= 0 || jointAlpha >= 1) {
    throw new Error(`jointAlpha must be in (0, 1) (got ${jointAlpha})`);
  }
  return jointAlpha / k;
}

/**
 * True iff every per-horizon coverage is at least (1 - jointAlpha).
 * Throws on empty coverages or out-of-range jointAlpha.
 */
export function validateJointCoverage(coverages: number[], jointAlpha: number): boolean {
  if (coverages.length === 0) {
    throw new Error('coverages must be non-empty');
  }
  if (!Number.isFinite(jointAlpha) || jointAlpha <= 0 || jointAlpha >= 1) {
    throw new Error(`jointAlpha must be in (0, 1) (got ${jointAlpha})`);
  }
  const target = 1 - jointAlpha;
  return coverages.every(c => c >= target);
}
