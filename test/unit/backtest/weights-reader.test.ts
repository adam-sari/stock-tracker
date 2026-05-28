import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { loadLatestWeights } from '@/lib/backtest/weights-reader';

const TEST_OUT_DIR = path.join(process.cwd(), '.vitest-cache', 'weights-reader');
const BACKTEST_DIR = path.join(TEST_OUT_DIR, 'out', 'backtest');

function reset() {
  if (existsSync(TEST_OUT_DIR)) rmSync(TEST_OUT_DIR, { recursive: true, force: true });
  mkdirSync(TEST_OUT_DIR, { recursive: true });
}

const validEnvelope = {
  method: 'ols_single_fold_v0',
  horizons: [5],
  train_days: 252,
  embargo_days: 21,
  test_days: 21,
  scoring_git_sha: 'abc123',
  realized_returns_max_date: '2024-12-31',
  survivorship_universe: 'currently_listed_sp500',
  windows: [
    {
      train_start: '2024-01-01',
      train_end: '2024-10-01',
      test_start: '2024-11-01',
      test_end: '2024-12-01',
      weights: { insider: 0.5, congress: 0.2, funds: 0, halts: 0, volume: 0.3, sentiment: 0 },
      alpha_selected: null,
      oos_ic_learned: 0.04,
      oos_ic_production: 0.02,
      oos_ic_backtest: null,
      n_train: 5000,
      n_test: 500,
    },
  ],
};

describe('loadLatestWeights', () => {
  beforeEach(reset);
  afterEach(() => rmSync(TEST_OUT_DIR, { recursive: true, force: true }));

  it('returns null when out/backtest does not exist', async () => {
    const result = await loadLatestWeights(TEST_OUT_DIR);
    expect(result).toBeNull();
  });

  it('returns null when no weights.json exists in any timestamped subdir', async () => {
    mkdirSync(path.join(BACKTEST_DIR, '20260526-100000'), { recursive: true });
    const result = await loadLatestWeights(TEST_OUT_DIR);
    expect(result).toBeNull();
  });

  it('picks the lexicographically newest timestamped subdir with weights.json', async () => {
    const older = path.join(BACKTEST_DIR, '20260526-100000');
    const newer = path.join(BACKTEST_DIR, '20260526-120000');
    mkdirSync(older, { recursive: true });
    mkdirSync(newer, { recursive: true });
    writeFileSync(path.join(older, 'weights.json'), JSON.stringify({
      ...validEnvelope,
      scoring_git_sha: 'older',
    }));
    writeFileSync(path.join(newer, 'weights.json'), JSON.stringify({
      ...validEnvelope,
      scoring_git_sha: 'newer',
    }));
    const result = await loadLatestWeights(TEST_OUT_DIR);
    expect(result).not.toBeNull();
    expect(result!.scoring_git_sha).toBe('newer');
  });

  it('parses the full envelope shape', async () => {
    const dir = path.join(BACKTEST_DIR, '20260526-120000');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'weights.json'), JSON.stringify(validEnvelope));
    const result = await loadLatestWeights(TEST_OUT_DIR);
    expect(result).not.toBeNull();
    expect(result!.method).toBe('ols_single_fold_v0');
    expect(result!.windows).toHaveLength(1);
    expect(result!.windows[0].weights.insider).toBeCloseTo(0.5, 6);
    expect(result!.windows[0].oos_ic_learned).toBeCloseTo(0.04, 6);
  });

  it('returns null on malformed JSON (does not throw)', async () => {
    const dir = path.join(BACKTEST_DIR, '20260526-120000');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'weights.json'), '{not valid json,,,');
    const result = await loadLatestWeights(TEST_OUT_DIR);
    expect(result).toBeNull();
  });

  it('returns null on shape mismatch (missing windows array)', async () => {
    const dir = path.join(BACKTEST_DIR, '20260526-120000');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'weights.json'), JSON.stringify({
      ...validEnvelope,
      windows: 'oops not an array',
    }));
    const result = await loadLatestWeights(TEST_OUT_DIR);
    expect(result).toBeNull();
  });

  it('returns null on shape mismatch (missing method)', async () => {
    const dir = path.join(BACKTEST_DIR, '20260526-120000');
    mkdirSync(dir, { recursive: true });
    const bad = { ...validEnvelope } as Record<string, unknown>;
    delete bad.method;
    writeFileSync(path.join(dir, 'weights.json'), JSON.stringify(bad));
    const result = await loadLatestWeights(TEST_OUT_DIR);
    expect(result).toBeNull();
  });

  it('returns null on shape mismatch (window weights not an object)', async () => {
    const dir = path.join(BACKTEST_DIR, '20260526-120000');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'weights.json'), JSON.stringify({
      ...validEnvelope,
      windows: [{ ...validEnvelope.windows[0], weights: 'oops' }],
    }));
    const result = await loadLatestWeights(TEST_OUT_DIR);
    expect(result).toBeNull();
  });
});
