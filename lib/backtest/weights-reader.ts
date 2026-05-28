import { promises as fs } from 'node:fs';
import path from 'node:path';

export type WeightWindow = {
  train_start: string;
  train_end: string;
  test_start: string;
  test_end: string;
  weights: Record<string, number>;
  alpha_selected: number | null;
  oos_ic_learned: number | null;
  oos_ic_production: number | null;
  oos_ic_backtest: number | null;
  n_train: number;
  n_test: number;
};

export type WeightsJson = {
  method: string;
  horizons: number[];
  train_days: number;
  embargo_days: number;
  test_days: number;
  scoring_git_sha: string | null;
  realized_returns_max_date: string | null;
  survivorship_universe: string;
  windows: WeightWindow[];
};

function isValidWeights(x: unknown): x is WeightsJson {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  if (typeof o.method !== 'string') return false;
  if (!Array.isArray(o.horizons)) return false;
  if (typeof o.survivorship_universe !== 'string') return false;
  if (!Array.isArray(o.windows)) return false;
  if (o.windows.length > 0) {
    const first = o.windows[0] as Record<string, unknown>;
    if (!first.weights || typeof first.weights !== 'object') return false;
  }
  return true;
}

/**
 * Find the newest out/backtest/<timestamp>/weights.json under `rootDir`,
 * parse it, return the typed shape. Returns null if no weights.json exists
 * or if the file is malformed / fails shape validation.
 *
 * Mirrors the pattern in summary-reader.ts (Plan 3 polish: defensive shape
 * validation so the page renders an empty state rather than crashing).
 *
 * `rootDir` defaults to the project's cwd; tests pass a temporary directory.
 */
export async function loadLatestWeights(rootDir: string = process.cwd()): Promise<WeightsJson | null> {
  const backtestDir = path.join(rootDir, 'out', 'backtest');
  let entries: string[];
  try {
    entries = await fs.readdir(backtestDir);
  } catch {
    return null;
  }
  const tsPattern = /^\d{8}-\d{6}$/;
  const candidates = entries.filter(e => tsPattern.test(e)).sort();
  for (let i = candidates.length - 1; i >= 0; i--) {
    const weightsPath = path.join(backtestDir, candidates[i], 'weights.json');
    try {
      const raw = await fs.readFile(weightsPath, 'utf-8');
      const parsed: unknown = JSON.parse(raw);
      if (!isValidWeights(parsed)) continue;
      return parsed;
    } catch {
      continue;
    }
  }
  return null;
}
