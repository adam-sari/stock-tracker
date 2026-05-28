import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { loadLatestSummary } from '@/lib/backtest/summary-reader';

const TEST_OUT_DIR = path.join(process.cwd(), '.vitest-cache', 'summary-reader');
const BACKTEST_DIR = path.join(TEST_OUT_DIR, 'out', 'backtest');

function reset() {
  if (existsSync(TEST_OUT_DIR)) rmSync(TEST_OUT_DIR, { recursive: true, force: true });
  mkdirSync(TEST_OUT_DIR, { recursive: true });
}

describe('loadLatestSummary', () => {
  beforeEach(reset);
  afterEach(() => rmSync(TEST_OUT_DIR, { recursive: true, force: true }));

  it('returns null when out/backtest dir does not exist', async () => {
    const result = await loadLatestSummary(TEST_OUT_DIR);
    expect(result).toBeNull();
  });

  it('returns null when out/backtest exists but has no timestamped subdirs', async () => {
    mkdirSync(BACKTEST_DIR, { recursive: true });
    const result = await loadLatestSummary(TEST_OUT_DIR);
    expect(result).toBeNull();
  });

  it('returns null when timestamped subdirs exist but none have summary.json', async () => {
    mkdirSync(path.join(BACKTEST_DIR, '20260526-100000'), { recursive: true });
    const result = await loadLatestSummary(TEST_OUT_DIR);
    expect(result).toBeNull();
  });

  it('picks the lexicographically newest timestamped subdir', async () => {
    const newer = path.join(BACKTEST_DIR, '20260526-120000');
    const older = path.join(BACKTEST_DIR, '20260526-100000');
    mkdirSync(newer, { recursive: true });
    mkdirSync(older, { recursive: true });
    writeFileSync(path.join(older, 'summary.json'), JSON.stringify({
      run: { from_date: '2024-01-01', to_date: '2024-12-31', scoring_git_sha: 'older', n_assets: 100, n_dates: 252 },
      horizons: [1], composite_ic: {}, per_signal: [],
    }));
    writeFileSync(path.join(newer, 'summary.json'), JSON.stringify({
      run: { from_date: '2024-01-01', to_date: '2024-12-31', scoring_git_sha: 'newer', n_assets: 200, n_dates: 252 },
      horizons: [1, 5], composite_ic: {}, per_signal: [],
    }));
    const result = await loadLatestSummary(TEST_OUT_DIR);
    expect(result).not.toBeNull();
    expect(result!.run.scoring_git_sha).toBe('newer');
    expect(result!.run.n_assets).toBe(200);
  });

  it('parses the full summary.json shape', async () => {
    const dir = path.join(BACKTEST_DIR, '20260526-120000');
    mkdirSync(dir, { recursive: true });
    const summary = {
      run: { from_date: '2024-01-01', to_date: '2024-12-31', scoring_git_sha: 'abc123', n_assets: 100, n_dates: 252 },
      horizons: [1, 5, 21, 63],
      composite_ic: {
        '1': { mean: 0.02, std: 0.1, ir: 0.2, t_stat: 2.5, n: 252, hit_rate: 0.55 },
      },
      per_signal: [
        { kind: 'insider', n_obs: 393, date_range: ['2024-01-01', '2024-12-31'] as [string, string],
          ic: { '1': { mean: 0.04, std: 0.12, ir: 0.3, t_stat: 3.5, n: 252, hit_rate: 0.6 } } },
      ],
    };
    writeFileSync(path.join(dir, 'summary.json'), JSON.stringify(summary));
    const result = await loadLatestSummary(TEST_OUT_DIR);
    expect(result).not.toBeNull();
    expect(result!.horizons).toEqual([1, 5, 21, 63]);
    expect(result!.composite_ic['1'].t_stat).toBe(2.5);
    expect(result!.per_signal[0].kind).toBe('insider');
  });

  it('returns null when summary.json is malformed JSON', async () => {
    const dir = path.join(BACKTEST_DIR, '20260526-120000');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'summary.json'), '{not valid json,,,');
    const result = await loadLatestSummary(TEST_OUT_DIR);
    expect(result).toBeNull();
  });

  it('returns null when summary.json is missing required top-level keys', async () => {
    const dir = path.join(BACKTEST_DIR, '20260526-120000');
    mkdirSync(dir, { recursive: true });
    // Missing composite_ic and per_signal
    writeFileSync(path.join(dir, 'summary.json'), JSON.stringify({
      run: { from_date: '2024-01-01', to_date: '2024-12-31', scoring_git_sha: 'x', n_assets: 0, n_dates: 0 },
      horizons: [1],
    }));
    const result = await loadLatestSummary(TEST_OUT_DIR);
    expect(result).toBeNull();
  });

  it('returns null when horizons is not an array', async () => {
    const dir = path.join(BACKTEST_DIR, '20260526-120000');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'summary.json'), JSON.stringify({
      run: { from_date: '2024-01-01', to_date: '2024-12-31', scoring_git_sha: 'x', n_assets: 0, n_dates: 0 },
      horizons: 'oops',
      composite_ic: {},
      per_signal: [],
    }));
    const result = await loadLatestSummary(TEST_OUT_DIR);
    expect(result).toBeNull();
  });
});
