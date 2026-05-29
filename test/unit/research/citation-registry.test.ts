import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';
import { parseCitations } from '@/lib/research/citation-registry';

const DIR = path.join(process.cwd(), '.vitest-cache', 'citation-registry');
const DB = path.join(DIR, 'test.db');

function reset() {
  closeDb();
  if (existsSync(DIR)) rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
  process.env.DB_PATH = DB;
  applySchema(getDb());
}

describe('parseCitations', () => {
  beforeEach(reset);
  afterAll(() => { closeDb(); rmSync(DIR, { recursive: true, force: true }); });

  function seedInsider(id: string) {
    getDb().prepare(`INSERT INTO insider_txns (id, ticker, insider_name, insider_role, code,
      is_derivative, shares, price, txn_date, filed_at, source)
      VALUES (?, 'EPAM', 'Test', 'CEO', 'P', 0, 100, 50, '2026-04-30', 1714000000, 'edgar')`).run(id);
  }

  it('replaces a single marker with sup tag at position 1', () => {
    seedInsider('a');
    const md = 'CEO bought [cite:insider_txns:a] last week.';
    const { html, citations } = parseCitations(md, getDb());
    expect(html).toContain('<sup class="cite" data-pos="1">');
    expect(html).toContain('href="#cite-1"');
    expect(citations).toHaveLength(1);
    expect(citations[0].position).toBe(1);
    expect(citations[0].source_table).toBe('insider_txns');
    expect(citations[0].source_id).toBe('a');
  });

  it('numbers sequentially across distinct markers', () => {
    seedInsider('a');
    seedInsider('b');
    const md = 'A [cite:insider_txns:a] B [cite:insider_txns:b].';
    const { citations } = parseCitations(md, getDb());
    expect(citations.map(c => c.position)).toEqual([1, 2]);
    expect(citations.map(c => c.source_id)).toEqual(['a', 'b']);
  });

  it('dedupes: same (table,id) reused → same number', () => {
    seedInsider('a');
    seedInsider('b');
    const md = '[cite:insider_txns:a] then [cite:insider_txns:b] then [cite:insider_txns:a] again.';
    const { html, citations } = parseCitations(md, getDb());
    expect(citations).toHaveLength(2);
    const sups = (html.match(/data-pos="1"/g) || []).length;
    expect(sups).toBe(2);
    expect(html).toContain('data-pos="2"');
  });

  it('preserves unknown table markers verbatim (no crash)', () => {
    const md = 'Fact [cite:totally_made_up:x] yes.';
    const { html, citations } = parseCitations(md, getDb());
    expect(html).toContain('[cite:totally_made_up:x]');
    expect(citations).toHaveLength(0);
  });

  it('renders the rest of the markdown as HTML (headers, bullets)', () => {
    seedInsider('a');
    const md = '## Title\n\n- bullet one [cite:insider_txns:a]\n- bullet two';
    const { html } = parseCitations(md, getDb());
    expect(html).toMatch(/<h2/);
    expect(html).toMatch(/<ul/);
    expect(html).toMatch(/<li/);
  });

  it('appends a "References" section with full citation list', () => {
    seedInsider('a');
    const md = 'Single [cite:insider_txns:a].';
    const { html } = parseCitations(md, getDb());
    expect(html).toMatch(/<h2[^>]*>References<\/h2>/);
    expect(html).toContain('id="cite-1"');
    expect(html).toContain('Test');
  });

  it('handles composite ids containing pipe characters', () => {
    getDb().prepare(`INSERT INTO candles_daily (ticker, date, open, high, low, close, volume, source)
      VALUES ('EPAM', '2026-05-07', 103, 111, 99, 104, 3580000, 'alpaca')`).run();
    const md = 'Volume was [cite:candles_daily:EPAM|2026-05-07].';
    const { citations } = parseCitations(md, getDb());
    expect(citations).toHaveLength(1);
    expect(citations[0].source_id).toBe('EPAM|2026-05-07');
  });
});
