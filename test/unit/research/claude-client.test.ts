import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCreate, AnthropicCtor } = vi.hoisted(() => {
  const create = vi.fn();
  const ctor = vi.fn().mockImplementation(() => ({ messages: { create } }));
  return { mockCreate: create, AnthropicCtor: ctor };
});
vi.mock('@anthropic-ai/sdk', () => ({ default: AnthropicCtor }));

import { callClaude } from '@/lib/research/claude-client';

beforeEach(() => { mockCreate.mockReset(); AnthropicCtor.mockClear(); });

const API_AUTH = { kind: 'api_key' as const, apiKey: 'test' };
const OAUTH = { kind: 'oauth' as const,
  token: { accessToken: 'oat_xyz', expiresAt: Date.now() + 60_000, subscription: 'max' } };

const FAKE_OK_RESPONSE = {
  content: [{ type: 'text', text: 'note body' }],
  model: 'claude-opus-4-7',
  stop_reason: 'end_turn',
  usage: { input_tokens: 100, output_tokens: 200,
            cache_read_input_tokens: 50, cache_creation_input_tokens: 0 },
};

describe('callClaude', () => {
  it('sends cache_control on system + first user content block', async () => {
    mockCreate.mockResolvedValueOnce(FAKE_OK_RESPONSE);
    await callClaude({
      systemPrompt: 'sys', cachedUserBlock: 'big ticker context',
      finalUserText: 'write the note', model: 'claude-opus-4-7', mode: 'standard',
      maxTokens: 4000, authOverride: API_AUTH,
    });
    const call = mockCreate.mock.calls[0][0];
    expect(call.system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(call.messages[0].content[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(call.messages[0].content[1].cache_control).toBeUndefined();
  });

  it('api_key path: computes cost in micro-USD using cache-discounted price', async () => {
    mockCreate.mockResolvedValueOnce(FAKE_OK_RESPONSE);
    const r = await callClaude({
      systemPrompt: 'sys', cachedUserBlock: 'ctx', finalUserText: 'q',
      model: 'claude-opus-4-7', mode: 'standard', maxTokens: 4000, authOverride: API_AUTH,
    });
    expect(r.text).toBe('note body');
    expect(r.auth_mode).toBe('api_key');
    expect(r.cost_usd_micros).toBeGreaterThan(0);
  });

  it('oauth path: constructs SDK with authToken (not apiKey) and records cost 0', async () => {
    mockCreate.mockResolvedValueOnce(FAKE_OK_RESPONSE);
    const r = await callClaude({
      systemPrompt: 'sys', cachedUserBlock: 'ctx', finalUserText: 'q',
      model: 'claude-opus-4-7', mode: 'standard', maxTokens: 4000, authOverride: OAUTH,
    });
    expect(AnthropicCtor).toHaveBeenCalledWith({ authToken: 'oat_xyz' });
    expect(r.auth_mode).toBe('oauth');
    expect(r.cost_usd_micros).toBe(0);
  });

  it('attaches web_search tool when mode is deep', async () => {
    mockCreate.mockResolvedValueOnce(FAKE_OK_RESPONSE);
    await callClaude({
      systemPrompt: 'sys', cachedUserBlock: 'ctx', finalUserText: 'q',
      model: 'claude-opus-4-7', mode: 'deep', maxTokens: 8000, authOverride: API_AUTH,
    });
    const call = mockCreate.mock.calls[0][0];
    expect(call.tools[0].type).toMatch(/web_search/);
  });

  it('retries on transient 5xx and succeeds on retry', async () => {
    const err: any = new Error('Internal Server Error'); err.status = 500;
    mockCreate.mockRejectedValueOnce(err).mockResolvedValueOnce(FAKE_OK_RESPONSE);
    const r = await callClaude({
      systemPrompt: 'sys', cachedUserBlock: 'ctx', finalUserText: 'q',
      model: 'claude-opus-4-7', mode: 'standard', maxTokens: 4000, authOverride: API_AUTH,
    });
    expect(r.text).toBe('note body');
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('throws after retries exhausted on persistent 5xx', async () => {
    const err: any = new Error('Internal Server Error'); err.status = 500;
    mockCreate.mockRejectedValue(err);
    await expect(callClaude({
      systemPrompt: 'sys', cachedUserBlock: 'ctx', finalUserText: 'q',
      model: 'claude-opus-4-7', mode: 'standard', maxTokens: 4000, authOverride: API_AUTH,
    })).rejects.toThrow();
    expect(mockCreate).toHaveBeenCalledTimes(3);
  });

  it('does not retry on 4xx (auth or bad request)', async () => {
    const err: any = new Error('Unauthorized'); err.status = 401;
    mockCreate.mockRejectedValueOnce(err);
    await expect(callClaude({
      systemPrompt: 'sys', cachedUserBlock: 'ctx', finalUserText: 'q',
      model: 'claude-opus-4-7', mode: 'standard', maxTokens: 4000, authOverride: API_AUTH,
    })).rejects.toThrow();
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('throws a helpful error when no auth is available', async () => {
    const prev = { k: process.env.ANTHROPIC_API_KEY, t: process.env.ANTHROPIC_AUTH_TOKEN,
                   c: process.env.CLAUDE_CREDS_PATH };
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_AUTH_TOKEN;
    process.env.CLAUDE_CREDS_PATH = '/definitely/not/a/real/path/creds.json';
    try {
      await expect(callClaude({
        systemPrompt: 'sys', cachedUserBlock: 'ctx', finalUserText: 'q',
        model: 'claude-opus-4-7', mode: 'standard', maxTokens: 4000,
      })).rejects.toThrow(/authentication/i);
    } finally {
      if (prev.k !== undefined) process.env.ANTHROPIC_API_KEY = prev.k;
      if (prev.t !== undefined) process.env.ANTHROPIC_AUTH_TOKEN = prev.t;
      if (prev.c !== undefined) process.env.CLAUDE_CREDS_PATH = prev.c;
      else delete process.env.CLAUDE_CREDS_PATH;
    }
  });
});
