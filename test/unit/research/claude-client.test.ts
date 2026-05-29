import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({ messages: { create: mockCreate } })),
}));

import { callClaude } from '@/lib/research/claude-client';

beforeEach(() => { mockCreate.mockReset(); });

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
      maxTokens: 4000,
    });
    const call = mockCreate.mock.calls[0][0];
    expect(call.system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(call.messages[0].content[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(call.messages[0].content[1].cache_control).toBeUndefined();
  });

  it('computes cost in micro-USD using cache-discounted input price', async () => {
    mockCreate.mockResolvedValueOnce(FAKE_OK_RESPONSE);
    const r = await callClaude({
      systemPrompt: 'sys', cachedUserBlock: 'ctx', finalUserText: 'q',
      model: 'claude-opus-4-7', mode: 'standard', maxTokens: 4000,
    });
    expect(r.text).toBe('note body');
    expect(r.usage.input_tokens).toBe(100);
    expect(r.usage.output_tokens).toBe(200);
    expect(r.usage.cache_read_input_tokens).toBe(50);
    expect(r.cost_usd_micros).toBeGreaterThan(0);
  });

  it('attaches web_search tool when mode is deep', async () => {
    mockCreate.mockResolvedValueOnce(FAKE_OK_RESPONSE);
    await callClaude({
      systemPrompt: 'sys', cachedUserBlock: 'ctx', finalUserText: 'q',
      model: 'claude-opus-4-7', mode: 'deep', maxTokens: 8000,
    });
    const call = mockCreate.mock.calls[0][0];
    expect(call.tools).toBeDefined();
    expect(call.tools[0].type).toMatch(/web_search/);
  });

  it('retries on transient 5xx and succeeds on retry', async () => {
    const err: any = new Error('Internal Server Error');
    err.status = 500;
    mockCreate.mockRejectedValueOnce(err).mockResolvedValueOnce(FAKE_OK_RESPONSE);
    const r = await callClaude({
      systemPrompt: 'sys', cachedUserBlock: 'ctx', finalUserText: 'q',
      model: 'claude-opus-4-7', mode: 'standard', maxTokens: 4000,
    });
    expect(r.text).toBe('note body');
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('throws after retries exhausted on persistent 5xx', async () => {
    const err: any = new Error('Internal Server Error'); err.status = 500;
    mockCreate.mockRejectedValue(err);
    await expect(callClaude({
      systemPrompt: 'sys', cachedUserBlock: 'ctx', finalUserText: 'q',
      model: 'claude-opus-4-7', mode: 'standard', maxTokens: 4000,
    })).rejects.toThrow();
    expect(mockCreate).toHaveBeenCalledTimes(3);
  });

  it('does not retry on 4xx (auth or bad request)', async () => {
    const err: any = new Error('Unauthorized'); err.status = 401;
    mockCreate.mockRejectedValueOnce(err);
    await expect(callClaude({
      systemPrompt: 'sys', cachedUserBlock: 'ctx', finalUserText: 'q',
      model: 'claude-opus-4-7', mode: 'standard', maxTokens: 4000,
    })).rejects.toThrow();
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});
