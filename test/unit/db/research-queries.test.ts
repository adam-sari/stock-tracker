import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';
import {
  getCachedResearchNote, upsertResearchNote, listRecentResearchNotes,
  getMonthlyResearchSpendUsd,
} from '@/lib/db/queries/research';
import type { ResearchNote, Citation } from '@/lib/research/types';

const DIR = path.join(process.cwd(), '.vitest-cache', 'research-queries');
const DB = path.join(DIR, 'test.db');

function reset() {
  closeDb();
  if (existsSync(DIR)) rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
  process.env.DB_PATH = DB;
  applySchema(getDb());
}

function fakeNote(overrides: Partial<ResearchNote> = {}): Omit<ResearchNote, 'id'> {
  return {
    ticker: 'EPAM', mode: 'standard', generated_at: Math.floor(Date.now() / 1000),
    model_id: 'claude-opus-4-7', prompt_version: '2026-05-28.1',
    prompt_tokens: 100, completion_tokens: 200,
    cache_read_tokens: 0, cache_creation_tokens: 0,
    cost_usd_micros: 4_200, markdown: 'note', html: '<p>note</p>',
    context_hash: 'hash1', status: 'ok', error_message: null,
    citations: [], ...overrides,
  };
}

describe('research queries', () => {
  beforeEach(reset);
  afterAll(() => { closeDb(); rmSync(DIR, { recursive: true, force: true }); });

  it('upsert + getCachedResearchNote round-trip', () => {
    const id = upsertResearchNote(fakeNote());
    expect(id).toBeGreaterThan(0);
    const found = getCachedResearchNote('EPAM', 'standard', 'hash1');
    expect(found).not.toBeNull();
    expect(found!.markdown).toBe('note');
    expect(found!.status).toBe('ok');
  });

  it('getCachedResearchNote returns null on hash mismatch', () => {
    upsertResearchNote(fakeNote({ context_hash: 'hash1' }));
    expect(getCachedResearchNote('EPAM', 'standard', 'different')).toBeNull();
  });

  it('returns null when last cached note is older than 24h', () => {
    const old = Math.floor(Date.now() / 1000) - (25 * 3600);
    upsertResearchNote(fakeNote({ generated_at: old }));
    expect(getCachedResearchNote('EPAM', 'standard', 'hash1')).toBeNull();
  });

  it('round-trips citations', () => {
    const cites: Citation[] = [
      { position: 1, source_table: 'insider_txns', source_id: 'a',
        source_summary: 'summary', source_deep_link: '/x' },
    ];
    upsertResearchNote(fakeNote({ citations: cites }));
    const found = getCachedResearchNote('EPAM', 'standard', 'hash1');
    expect(found!.citations).toHaveLength(1);
    expect(found!.citations[0]).toMatchObject({ position: 1, source_id: 'a' });
  });

  it('listRecentResearchNotes returns notes newest-first', () => {
    const now = Math.floor(Date.now() / 1000);
    upsertResearchNote(fakeNote({ generated_at: now - 100, context_hash: 'a' }));
    upsertResearchNote(fakeNote({ generated_at: now - 50, context_hash: 'b' }));
    const list = listRecentResearchNotes('EPAM', 10);
    expect(list).toHaveLength(2);
    expect(list[0].context_hash).toBe('b');
  });

  it('getMonthlyResearchSpendUsd sums current month only', () => {
    const lastMonth = Math.floor(new Date('2025-01-01').getTime() / 1000);
    const now = Math.floor(Date.now() / 1000);
    upsertResearchNote(fakeNote({ generated_at: lastMonth, cost_usd_micros: 99_000, context_hash: 'x' }));
    upsertResearchNote(fakeNote({ generated_at: now - 100, cost_usd_micros: 12_000, context_hash: 'y' }));
    upsertResearchNote(fakeNote({ generated_at: now - 50, cost_usd_micros: 5_000, context_hash: 'z' }));
    const spend = getMonthlyResearchSpendUsd();
    expect(spend).toBeCloseTo(0.017, 5);
  });
});
