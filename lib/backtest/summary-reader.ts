import { promises as fs } from 'node:fs';
import path from 'node:path';

export type ICSummary = {
  mean: number; std: number; ir: number; t_stat: number; n: number; hit_rate: number;
};

export type CarStats = { mean: number | null; std: number | null; n: number; tstat: number | null };

export type PerSignal = {
  kind: string;
  n_obs: number;
  date_range: [string, string];
  ic?: Record<string, ICSummary>;
  car?: Record<string, CarStats>;
  car_plot_b64?: string;
};

export type SummaryJson = {
  run: {
    from_date: string;
    to_date: string;
    scoring_git_sha: string;
    n_assets: number;
    n_dates: number;
  };
  horizons: number[];
  composite_ic: Record<string, ICSummary>;
  per_signal: PerSignal[];
};

function isValidSummary(x: unknown): x is SummaryJson {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  if (!o.run || typeof o.run !== 'object') return false;
  if (!Array.isArray(o.horizons)) return false;
  if (!o.composite_ic || typeof o.composite_ic !== 'object') return false;
  if (!Array.isArray(o.per_signal)) return false;
  return true;
}

/**
 * Find the newest out/backtest/<timestamp>/summary.json under `rootDir`,
 * parse it, return the typed shape. Returns null if no summary exists
 * or if the file is malformed / fails shape validation (so callers can
 * render an EmptyState rather than crashing at render-time).
 *
 * `rootDir` defaults to the project's cwd; tests pass a temporary directory.
 */
export async function loadLatestSummary(rootDir: string = process.cwd()): Promise<SummaryJson | null> {
  const backtestDir = path.join(rootDir, 'out', 'backtest');
  let entries: string[];
  try {
    entries = await fs.readdir(backtestDir);
  } catch {
    return null;
  }
  // Timestamps are YYYYMMDD-HHMMSS — lexicographic sort = chronological sort.
  const tsPattern = /^\d{8}-\d{6}$/;
  const candidates = entries.filter(e => tsPattern.test(e)).sort();
  for (let i = candidates.length - 1; i >= 0; i--) {
    const summaryPath = path.join(backtestDir, candidates[i], 'summary.json');
    try {
      const raw = await fs.readFile(summaryPath, 'utf-8');
      const parsed: unknown = JSON.parse(raw);
      if (!isValidSummary(parsed)) continue;
      return parsed;
    } catch {
      continue;
    }
  }
  return null;
}
