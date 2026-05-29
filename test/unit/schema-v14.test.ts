import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';

const TEST_DB_DIR = path.join(process.cwd(), '.vitest-cache', 'schema-v14');
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test.db');

describe('schema v14 — research tables', () => {
  beforeEach(() => {
    closeDb();
    if (existsSync(TEST_DB_DIR)) rmSync(TEST_DB_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DB_DIR, { recursive: true });
    process.env.DB_PATH = TEST_DB_PATH;
    applySchema(getDb());
  });
  afterAll(() => { closeDb(); rmSync(TEST_DB_DIR, { recursive: true, force: true }); });

  it('records schema_version 14', () => {
    const row = getDb().prepare('SELECT version FROM schema_version WHERE version = 14').get();
    expect(row).toBeTruthy();
  });

  it('creates research_notes with all required columns', () => {
    const cols = getDb().prepare("PRAGMA table_info('research_notes')").all() as Array<{ name: string }>;
    const names = cols.map(c => c.name).sort();
    expect(names).toEqual([
      'cache_creation_tokens', 'cache_read_tokens', 'completion_tokens',
      'context_hash', 'cost_usd_micros', 'error_message', 'generated_at',
      'html', 'id', 'markdown', 'mode', 'model_id', 'prompt_tokens',
      'prompt_version', 'status', 'ticker',
    ]);
  });

  it('creates research_citations with FK to research_notes', () => {
    getDb().prepare(`INSERT INTO research_notes (ticker, mode, generated_at, model_id, prompt_version,
      prompt_tokens, completion_tokens, cost_usd_micros, markdown, html, context_hash, status)
      VALUES ('EPAM', 'standard', 1, 'm', 'v', 0, 0, 0, '', '', 'h', 'ok')`).run();
    const noteId = (getDb().prepare('SELECT id FROM research_notes').get() as { id: number }).id;
    getDb().prepare(`INSERT INTO research_citations (note_id, position, source_table, source_id, source_summary, source_deep_link)
      VALUES (?, 1, 'insider_txns', 'abc', 'summary', '/x')`).run(noteId);
    const c = getDb().prepare('SELECT * FROM research_citations').get() as any;
    expect(c.note_id).toBe(noteId);
    expect(c.position).toBe(1);
  });

  it('enforces mode CHECK constraint', () => {
    expect(() => getDb().prepare(`INSERT INTO research_notes (ticker, mode, generated_at, model_id,
      prompt_version, prompt_tokens, completion_tokens, cost_usd_micros, markdown, html, context_hash, status)
      VALUES ('X', 'invalid', 1, 'm', 'v', 0, 0, 0, '', '', 'h', 'ok')`).run()).toThrow();
  });
});
