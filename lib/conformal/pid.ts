// Conformal PID controller for online conformal prediction under distribution
// shift. Algorithm 1 of Angelopoulos, Candès, Tibshirani — NeurIPS 2023.
// https://arxiv.org/abs/2307.10480
import type { PidGains, PidObservation, PidState } from './types';

export const DEFAULT_GAINS: PidGains = { etaP: 0.01, etaI: 0.05, etaD: 0.005 };

// Rolling coverage uses a count-based EMA-equivalent: weight = 1/W until W
// observations seen, then 1/W forever. Cheap, stable.
const COVERAGE_WINDOW = 100;

export function applyPidStep(
  state: PidState,
  obs: PidObservation,
  gains: PidGains,
): PidState {
  const exceeded = obs.score > state.q_t ? 1 : 0;
  const err_t = exceeded - obs.alphaTarget;

  const integral_t = state.integral + gains.etaI * err_t;
  const proportional_t = gains.etaP * err_t;
  const derivative_t = gains.etaD * (err_t - state.prev_err);
  // integral_t is the full accumulated I-term (Σ etaI·err_i), not just the
  // per-step increment — this matches Algorithm 1 of the paper, where the
  // integral is the running sum of weighted errors. q_t is intentionally
  // unclamped; downstream callers may bound it if their use case requires.
  const q_next = state.q_t + integral_t + proportional_t + derivative_t;

  // Rolling coverage: blend previous coverage with this observation's outcome.
  const covered = exceeded === 0 ? 1 : 0;
  const w = Math.min(state.updates_count + 1, COVERAGE_WINDOW);
  // First update: empirical_coverage is null, so we seed from this
  // observation's outcome. Subsequent updates blend with prior history.
  const prev = state.empirical_coverage ?? covered;
  const empirical_coverage = (prev * (w - 1) + covered) / w;

  return {
    q_t: q_next,
    integral: integral_t,
    prev_err: err_t,
    updates_count: state.updates_count + 1,
    empirical_coverage,
  };
}
