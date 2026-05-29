import Anthropic from '@anthropic-ai/sdk';
import type { Mode } from './types';

// Anthropic pricing per million tokens (Opus 4.7 as of 2026-01).
// All values stored as micro-USD per million tokens to avoid floats.
const PRICING = {
  'claude-opus-4-7': {
    input_per_mtok_usd_micros: 15_000_000,        // $15/M
    cache_write_per_mtok_usd_micros: 18_750_000,  // $15 × 1.25
    cache_read_per_mtok_usd_micros: 1_500_000,    // $15 × 0.10
    output_per_mtok_usd_micros: 75_000_000,       // $75/M
  },
  'claude-sonnet-4-6': {
    input_per_mtok_usd_micros: 3_000_000,
    cache_write_per_mtok_usd_micros: 3_750_000,
    cache_read_per_mtok_usd_micros: 300_000,
    output_per_mtok_usd_micros: 15_000_000,
  },
  'claude-haiku-4-5-20251001': {
    input_per_mtok_usd_micros: 800_000,
    cache_write_per_mtok_usd_micros: 1_000_000,
    cache_read_per_mtok_usd_micros: 80_000,
    output_per_mtok_usd_micros: 4_000_000,
  },
} as const;

const MAX_RETRIES = 3;

export type CallOpts = {
  systemPrompt: string;
  cachedUserBlock: string;
  finalUserText: string;
  model: string;
  mode: Mode;
  maxTokens: number;
  apiKey?: string;
};

export type CallResult = {
  text: string;
  model: string;
  stop_reason: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens: number;
    cache_creation_input_tokens: number;
  };
  cost_usd_micros: number;
};

function isRetryable(err: any): boolean {
  const s = err?.status ?? err?.response?.status;
  return s === 408 || s === 429 || (typeof s === 'number' && s >= 500 && s < 600);
}

function priceFor(model: string) {
  return PRICING[model as keyof typeof PRICING] ?? PRICING['claude-opus-4-7'];
}

function computeCostMicros(model: string, u: CallResult['usage']): number {
  const p = priceFor(model);
  const reads = u.cache_read_input_tokens;
  const writes = u.cache_creation_input_tokens;
  const freshInput = Math.max(0, u.input_tokens - reads - writes);
  return Math.round(
    (freshInput * p.input_per_mtok_usd_micros +
      writes * p.cache_write_per_mtok_usd_micros +
      reads * p.cache_read_per_mtok_usd_micros +
      u.output_tokens * p.output_per_mtok_usd_micros) / 1_000_000
  );
}

export async function callClaude(opts: CallOpts): Promise<CallResult> {
  const client = new Anthropic({ apiKey: opts.apiKey ?? process.env.ANTHROPIC_API_KEY });

  const params: any = {
    model: opts.model,
    max_tokens: opts.maxTokens,
    system: [{ type: 'text', text: opts.systemPrompt, cache_control: { type: 'ephemeral' } }],
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: opts.cachedUserBlock, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: opts.finalUserText },
      ],
    }],
  };
  if (opts.mode === 'deep') {
    params.tools = [{ type: 'web_search_20250305', name: 'web_search' }];
  }

  let lastErr: any;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res: any = await client.messages.create(params);
      const text = (res.content ?? [])
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.text).join('\n');
      const usage = {
        input_tokens: res.usage?.input_tokens ?? 0,
        output_tokens: res.usage?.output_tokens ?? 0,
        cache_read_input_tokens: res.usage?.cache_read_input_tokens ?? 0,
        cache_creation_input_tokens: res.usage?.cache_creation_input_tokens ?? 0,
      };
      return {
        text, model: res.model ?? opts.model, stop_reason: res.stop_reason ?? null,
        usage, cost_usd_micros: computeCostMicros(opts.model, usage),
      };
    } catch (e) {
      lastErr = e;
      if (!isRetryable(e)) throw e;
      await new Promise(r => setTimeout(r, 250 * (2 ** attempt)));
    }
  }
  throw lastErr;
}
