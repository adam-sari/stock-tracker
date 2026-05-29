import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { buildTickerContext } from './context-builder';
import { parseCitations } from './citation-registry';
import { callClaude } from './claude-client';
import { PROMPT_VERSION } from './version';
import {
  getCachedResearchNote, upsertResearchNote, getMonthlyResearchSpendUsd,
} from '@/lib/db/queries/research';
import type { ResearchNote, Mode } from './types';

const PROMPT_DIR = path.join(process.cwd(), 'lib', 'research', 'prompts');

function loadPrompt(name: 'system' | 'standard' | 'deep'): string {
  return readFileSync(path.join(PROMPT_DIR, `${name}.md`), 'utf-8');
}

function ceilingMicros(mode: Mode): number {
  const usd = mode === 'deep'
    ? Number(process.env.RESEARCH_DEEP_CEILING_USD ?? 0.25)
    : Number(process.env.RESEARCH_STANDARD_CEILING_USD ?? 0.08);
  return Math.round(usd * 1_000_000);
}

function maxTokensForCeiling(mode: Mode): number {
  // Output tokens dominate cost. Cap such that
  // (max_tokens × output_price_per_micro_per_token) ≤ ceiling.
  // Opus 4.7 output: 75_000_000 micro-USD per million tokens = 75 per token.
  const ceil = ceilingMicros(mode);
  const outputRate = 75;
  return Math.max(1000, Math.floor(ceil / outputRate));
}

export type GenerateOpts = { force?: boolean };

export async function generateResearchNote(
  ticker: string, mode: Mode, db: Database.Database, opts: GenerateOpts = {},
): Promise<ResearchNote> {
  const t = ticker.toUpperCase();

  // Monthly budget gate
  const monthlyBudget = Number(process.env.RESEARCH_MONTHLY_BUDGET_USD ?? 50);
  const spent = getMonthlyResearchSpendUsd();
  if (spent >= monthlyBudget) {
    throw new Error(`Monthly research budget exceeded ($${spent.toFixed(2)} / $${monthlyBudget})`);
  }

  const context = buildTickerContext(t, db, mode);
  const contextJson = JSON.stringify(context);
  const context_hash = createHash('sha256').update(contextJson).digest('hex');

  if (!opts.force) {
    const cached = getCachedResearchNote(t, mode, context_hash);
    if (cached) return cached;
  }

  const model = process.env.RESEARCH_MODEL_ID || 'claude-opus-4-7';
  const systemPrompt = loadPrompt('system');
  const userTemplate = loadPrompt(mode);
  const cachedUserBlock = `<ticker_context>\n${contextJson}\n</ticker_context>`;
  const finalUserText = userTemplate.replace('{{TICKER}}', t).replace('{{CONTEXT_JSON}}', '');

  const generated_at = Math.floor(Date.now() / 1000);

  try {
    const claude = await callClaude({
      systemPrompt, cachedUserBlock, finalUserText, model, mode,
      maxTokens: maxTokensForCeiling(mode),
    });
    const { html, citations } = parseCitations(claude.text, db);
    const status: ResearchNote['status'] = claude.stop_reason === 'max_tokens' ? 'partial' : 'ok';

    const note: Omit<ResearchNote, 'id'> = {
      ticker: t, mode, generated_at, model_id: claude.model,
      prompt_version: PROMPT_VERSION,
      prompt_tokens: claude.usage.input_tokens,
      completion_tokens: claude.usage.output_tokens,
      cache_read_tokens: claude.usage.cache_read_input_tokens,
      cache_creation_tokens: claude.usage.cache_creation_input_tokens,
      cost_usd_micros: claude.cost_usd_micros,
      markdown: claude.text, html, context_hash, status, error_message: null,
      citations,
    };
    const id = upsertResearchNote(note);
    return { id, ...note };
  } catch (e) {
    const msg = (e as Error).message;
    try {
      upsertResearchNote({
        ticker: t, mode, generated_at, model_id: model, prompt_version: PROMPT_VERSION,
        prompt_tokens: 0, completion_tokens: 0,
        cache_read_tokens: 0, cache_creation_tokens: 0, cost_usd_micros: 0,
        markdown: '', html: '', context_hash, status: 'error', error_message: msg,
        citations: [],
      });
    } catch { /* swallow secondary errors */ }
    throw e;
  }
}
