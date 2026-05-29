import { getDb } from '@/lib/db/connection';
import type { ResearchNote, Citation, Mode } from '@/lib/research/types';

const CACHE_TTL_SEC = 24 * 3600;

function rowToNote(row: any, citations: Citation[]): ResearchNote {
  return {
    id: row.id, ticker: row.ticker, mode: row.mode as Mode, generated_at: row.generated_at,
    model_id: row.model_id, prompt_version: row.prompt_version,
    prompt_tokens: row.prompt_tokens, completion_tokens: row.completion_tokens,
    cache_read_tokens: row.cache_read_tokens, cache_creation_tokens: row.cache_creation_tokens,
    cost_usd_micros: row.cost_usd_micros, markdown: row.markdown, html: row.html,
    context_hash: row.context_hash, status: row.status, error_message: row.error_message,
    citations,
  };
}

export function getCachedResearchNote(
  ticker: string, mode: Mode, contextHash: string,
): ResearchNote | null {
  const db = getDb();
  const cutoff = Math.floor(Date.now() / 1000) - CACHE_TTL_SEC;
  const row = db.prepare(`SELECT * FROM research_notes
    WHERE ticker = ? AND mode = ? AND context_hash = ? AND generated_at >= ?
      AND status IN ('ok','partial')
    ORDER BY generated_at DESC LIMIT 1`).get(ticker, mode, contextHash, cutoff) as any;
  if (!row) return null;
  const citations = db.prepare(`SELECT position, source_table, source_id, source_summary, source_deep_link
    FROM research_citations WHERE note_id = ? ORDER BY position`).all(row.id) as Citation[];
  return rowToNote(row, citations);
}

export function listRecentResearchNotes(ticker: string, limit: number): ResearchNote[] {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM research_notes WHERE ticker = ?
    ORDER BY generated_at DESC LIMIT ?`).all(ticker, limit) as Array<any>;
  return rows.map(r => {
    const cites = db.prepare(`SELECT position, source_table, source_id, source_summary, source_deep_link
      FROM research_citations WHERE note_id = ? ORDER BY position`).all(r.id) as Citation[];
    return rowToNote(r, cites);
  });
}

export function upsertResearchNote(note: Omit<ResearchNote, 'id'>): number {
  const db = getDb();
  const insert = db.prepare(`INSERT INTO research_notes
    (ticker, mode, generated_at, model_id, prompt_version, prompt_tokens, completion_tokens,
     cache_read_tokens, cache_creation_tokens, cost_usd_micros, markdown, html, context_hash,
     status, error_message)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const tx = db.transaction(() => {
    const r = insert.run(
      note.ticker, note.mode, note.generated_at, note.model_id, note.prompt_version,
      note.prompt_tokens, note.completion_tokens, note.cache_read_tokens, note.cache_creation_tokens,
      note.cost_usd_micros, note.markdown, note.html, note.context_hash, note.status,
      note.error_message,
    );
    const id = Number(r.lastInsertRowid);
    const insCite = db.prepare(`INSERT INTO research_citations
      (note_id, position, source_table, source_id, source_summary, source_deep_link)
      VALUES (?, ?, ?, ?, ?, ?)`);
    for (const c of note.citations) {
      insCite.run(id, c.position, c.source_table, c.source_id, c.source_summary, c.source_deep_link);
    }
    return id;
  });
  return tx();
}

export function getMonthlyResearchSpendUsd(): number {
  const db = getDb();
  const now = new Date();
  const monthStart = Math.floor(new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000);
  const r = db.prepare(`SELECT COALESCE(SUM(cost_usd_micros), 0) AS s
    FROM research_notes WHERE generated_at >= ?`).get(monthStart) as { s: number };
  return r.s / 1_000_000;
}
