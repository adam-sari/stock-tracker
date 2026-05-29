export type PidGains = { etaP: number; etaI: number; etaD: number };

export type PidState = {
  q_t: number;
  integral: number;
  prev_err: number;
  updates_count: number;
  empirical_coverage: number | null;
};

export type PidObservation = {
  score: number;          // CQR nonconformity score
  alphaTarget: number;    // per-horizon Bonferroni-corrected target
};
