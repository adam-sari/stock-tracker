import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';

const { callClaudeMock } = vi.hoisted(() => ({ callClaudeMock: vi.fn() }));
vi.mock('@/lib/research/claude-client', () => ({ callClaude: callClaudeMock }));

import { generateResearchNote } from '@/lib/research/generator';

const DIR = path.join(process.cwd(), '.vitest-cache', 'generator');
const DB = path.join(DIR, 'test.db');

function reset() {
  closeDb();
  if (existsSync(DIR)) rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
  process.env.DB_PATH = DB;
  process.env.ANTHROPIC_API_KEY = 'test-key';
  process.env.RESEARCH_STANDARD_CEILING_USD = '0.08';
  process.env.RESEARCH_DEEP_CEILING_USD = '0.25';
  process.env.RESEARCH_MONTHLY_BUDGET_USD = '50';
  process.env.RESEARCH_MODEL_ID = 'claude-opus-4-7';
  applySchema(getDb());
  callClaudeMock.mockReset();
}

const OK = {
  text: '## Thesis\n\nReal note [cite:insider_txns:a].\n',
  model: 'claude-opus-4-7', stop_reason: 'end_turn',
  usage: { input_tokens: 100, output_tokens: 200,
            cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  cost_usd_micros: 4_200,
};

describe('generateResearchNote', () => {
  beforeEach(reset);
  afterAll(() => { closeDb(); rmSync(DIR, { recursive: true, force: true }); });

  it('full flow: builds context, calls Claude, persists, returns note', async () => {
    getDb().prepare(`INSERT INTO insider_txns (id, ticker, insider_name, code, is_derivative,
      shares, txn_date, filed_at, source)
      VALUES ('a','EPAM','Fejes','P',0,77,'2026-04-30',strftime('%s','now'),'edgar')`).run();
    callClaudeMock.mockResolvedValueOnce(OK);
    const note = await generateResearchNote('EPAM', 'standard', getDb());
    expect(note.status).toBe('ok');
    expect(note.markdown).toContain('Real note');
    expect(note.html).toMatch(/<sup/);
    expect(note.citations.length).toBeGreaterThanOrEqual(1);
    expect(callClaudeMock).toHaveBeenCalledTimes(1);
  });

  it('returns cached result on second call without invoking Claude', async () => {
    getDb().prepare(`INSERT INTO insider_txns (id, ticker, insider_name, code, is_derivative,
      shares, txn_date, filed_at, source)
      VALUES ('a','EPAM','Fejes','P',0,77,'2026-04-30',strftime('%s','now'),'edgar')`).run();
    callClaudeMock.mockResolvedValueOnce(OK);
    await generateResearchNote('EPAM', 'standard', getDb());
    callClaudeMock.mockClear();
    const second = await generateResearchNote('EPAM', 'standard', getDb());
    expect(callClaudeMock).not.toHaveBeenCalled();
    expect(second.markdown).toContain('Real note');
  });

  it('force=true bypasses the cache', async () => {
    getDb().prepare(`INSERT INTO insider_txns (id, ticker, insider_name, code, is_derivative,
      shares, txn_date, filed_at, source)
      VALUES ('a','EPAM','Fejes','P',0,77,'2026-04-30',strftime('%s','now'),'edgar')`).run();
    callClaudeMock.mockResolvedValue(OK);
    await generateResearchNote('EPAM', 'standard', getDb());
    // Wait a sec so the generated_at differs
    await new Promise(r => setTimeout(r, 1100));
    await generateResearchNote('EPAM', 'standard', getDb(), { force: true });
    expect(callClaudeMock).toHaveBeenCalledTimes(2);
  });

  it('throws when monthly budget exceeded', async () => {
    getDb().prepare(`INSERT INTO research_notes (ticker, mode, generated_at, model_id, prompt_version,
      prompt_tokens, completion_tokens, cost_usd_micros, markdown, html, context_hash, status)
      VALUES ('OTHER','standard', strftime('%s','now'), 'm','v',0,0,50000001,'','','h','ok')`).run();
    callClaudeMock.mockResolvedValueOnce(OK);
    await expect(generateResearchNote('EPAM', 'standard', getDb()))
      .rejects.toThrow(/budget/);
    expect(callClaudeMock).not.toHaveBeenCalled();
  });

  it('persists status=partial when ceiling truncates response', async () => {
    callClaudeMock.mockResolvedValueOnce({ ...OK, stop_reason: 'max_tokens' });
    const note = await generateResearchNote('EPAM', 'standard', getDb());
    expect(note.status).toBe('partial');
  });

  it('persists status=error and rethrows on Claude failure', async () => {
    callClaudeMock.mockRejectedValueOnce(new Error('network kaboom'));
    await expect(generateResearchNote('EPAM', 'standard', getDb()))
      .rejects.toThrow(/kaboom/);
    const row = getDb().prepare(`SELECT status, error_message FROM research_notes`).get() as any;
    expect(row.status).toBe('error');
    expect(row.error_message).toContain('kaboom');
  });
});
