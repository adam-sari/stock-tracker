import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { getDb, closeDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';
import { applyPidStep, DEFAULT_GAINS } from '@/lib/conformal/pid';
import { perHorizonAlpha } from '@/lib/conformal/bonferroni';

const GATED = process.env.RUN_SLOW_TESTS === '1';
const maybe = GATED ? describe : describe.skip;

const DIR = path.join(process.cwd(), '.vitest-cache', 'e2e-coverage');
const DB = path.join(DIR, 'test.db');

beforeAll(() => {
  closeDb();
  if (existsSync(DIR)) rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
  process.env.DB_PATH = DB;
  applySchema(getDb());
});
afterAll(() => { closeDb(); rmSync(DIR, { recursive: true, force: true }); });

maybe('end-to-end conformal coverage', () => {
  it('empirical coverage on a 2000-step synthetic stream is within ±2pp of 90%', () => {
    const N = 2000;
    const alphaTarget = perHorizonAlpha(0.10, 4); // 0.025 per horizon
    let state = { q_t: 0, integral: 0, prev_err: 0, updates_count: 0,
                  empirical_coverage: null as number | null };
    let seed = 1234;
    const rand = () => { seed = (seed * 1664525 + 1013904223) & 0x7fffffff;
                         return seed / 0x7fffffff; };
    let covered = 0;
    for (let i = 0; i < N; i++) {
      // True ~2.5% exceedance distribution
      const score = rand() < alphaTarget ? 1.0 + rand() : rand() * 0.5;
      const exceed = score > state.q_t ? 1 : 0;
      if (!exceed) covered++;
      state = applyPidStep(state, { score, alphaTarget }, DEFAULT_GAINS);
    }
    const empirical = covered / N;
    const target = 1 - alphaTarget;
    expect(Math.abs(empirical - target)).toBeLessThan(0.02);
  }, 30_000);
});
