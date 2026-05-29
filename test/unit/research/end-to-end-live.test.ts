import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';
import { generateResearchNote } from '@/lib/research/generator';

const DIR = path.join(process.cwd(), '.vitest-cache', 'research-live');
const DB = path.join(DIR, 'test.db');

const GATED = process.env.ANTHROPIC_API_KEY && process.env.RUN_LIVE_TESTS === '1';
const maybe = GATED ? describe : describe.skip;

function reset() {
  closeDb();
  if (existsSync(DIR)) rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
  process.env.DB_PATH = DB;
  applySchema(getDb());
}

maybe('end-to-end live Claude call', () => {
  beforeEach(reset);
  afterAll(() => { closeDb(); rmSync(DIR, { recursive: true, force: true }); });

  it('generates a standard note with citations and required sections', async () => {
    const now = Math.floor(Date.now() / 1000);
    getDb().prepare(`INSERT INTO stock_meta (ticker, name, sector, market_cap)
      VALUES ('TEST', 'Test Corp', 'IT Services', 1000000000)`).run();
    for (let i = 0; i < 4; i++) {
      getDb().prepare(`INSERT INTO insider_txns (id, ticker, insider_name, insider_role, code,
        is_derivative, shares, price, txn_date, filed_at, source)
        VALUES (?, 'TEST', ?, 'CEO', 'P', 0, 100, 50, '2026-04-30', ?, 'edgar')`).run(`i${i}`, `Insider${i}`, now - 1);
    }
    for (let i = 0; i < 30; i++) {
      const d = new Date('2026-04-01T00:00:00Z'); d.setUTCDate(d.getUTCDate() + i);
      getDb().prepare(`INSERT INTO candles_daily (ticker, date, open, high, low, close, volume, source)
        VALUES ('TEST', ?, 100, 101, 99, ?, 1000000, 'alpaca')`).run(
        d.toISOString().slice(0, 10), 100 + i);
    }

    const note = await generateResearchNote('TEST', 'standard', getDb());
    expect(note.status).toBe('ok');
    expect(note.markdown).toMatch(/## Thesis/);
    expect(note.markdown).toMatch(/## What just happened/);
    expect(note.markdown).toMatch(/## Bull case/);
    expect(note.markdown).toMatch(/## Bear case/);
    expect(note.markdown).toMatch(/## Recent catalysts/);
    expect(note.markdown).toMatch(/## Risk factors/);
    expect(note.markdown).toMatch(/## What to investigate further/);
    expect(note.citations.length).toBeGreaterThan(2);
    expect(note.markdown.toLowerCase()).not.toContain('knowledge cutoff');
    expect(note.markdown.toLowerCase()).not.toContain('my training data');
    expect(note.cost_usd_micros).toBeLessThan(80_000);
  }, 60_000);
});
