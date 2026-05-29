import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';

const { generateMock } = vi.hoisted(() => ({ generateMock: vi.fn() }));
vi.mock('@/lib/research/generator', () => ({ generateResearchNote: generateMock }));

const DIR = path.join(process.cwd(), '.vitest-cache', 'research-route');
const DBP = path.join(DIR, 'test.db');

function reset() {
  closeDb();
  if (existsSync(DIR)) rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
  process.env.DB_PATH = DBP;
  applySchema(getDb());
  generateMock.mockReset();
}

const FAKE_NOTE = {
  id: 1, ticker: 'EPAM', mode: 'standard', generated_at: 1,
  model_id: 'claude-opus-4-7', prompt_version: 'v1',
  prompt_tokens: 100, completion_tokens: 200,
  cache_read_tokens: 0, cache_creation_tokens: 0, cost_usd_micros: 4200,
  markdown: 'md', html: '<p>md</p>', context_hash: 'h', status: 'ok',
  error_message: null, citations: [],
};

describe('research route', () => {
  beforeEach(reset);
  afterAll(() => { closeDb(); rmSync(DIR, { recursive: true, force: true }); });

  it('GET returns 404 when no cached note', async () => {
    const { GET } = await import('@/app/api/research/[ticker]/route');
    const res = await GET(new Request('http://x'), { params: Promise.resolve({ ticker: 'EPAM' }) } as any);
    expect(res.status).toBe(404);
  });

  it('GET returns 400 for invalid ticker', async () => {
    const { GET } = await import('@/app/api/research/[ticker]/route');
    const res = await GET(new Request('http://x'), { params: Promise.resolve({ ticker: 'bad ticker!' }) } as any);
    expect(res.status).toBe(400);
  });

  it('GET returns 400 for invalid mode', async () => {
    const { GET } = await import('@/app/api/research/[ticker]/route');
    const res = await GET(new Request('http://x/?mode=junk'), { params: Promise.resolve({ ticker: 'EPAM' }) } as any);
    expect(res.status).toBe(400);
  });

  it('POST returns the generated note', async () => {
    generateMock.mockResolvedValueOnce(FAKE_NOTE);
    const { POST } = await import('@/app/api/research/[ticker]/route');
    const res = await POST(new Request('http://x', { method: 'POST' }),
      { params: Promise.resolve({ ticker: 'EPAM' }) } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.note.markdown).toBe('md');
  });

  it('POST returns 402 when generator throws budget error', async () => {
    generateMock.mockRejectedValueOnce(new Error('Monthly research budget exceeded ($50.00 / $50)'));
    const { POST } = await import('@/app/api/research/[ticker]/route');
    const res = await POST(new Request('http://x', { method: 'POST' }),
      { params: Promise.resolve({ ticker: 'EPAM' }) } as any);
    expect(res.status).toBe(402);
  });

  it('POST returns 500 on other errors', async () => {
    generateMock.mockRejectedValueOnce(new Error('network kaboom'));
    const { POST } = await import('@/app/api/research/[ticker]/route');
    const res = await POST(new Request('http://x', { method: 'POST' }),
      { params: Promise.resolve({ ticker: 'EPAM' }) } as any);
    expect(res.status).toBe(500);
  });

  it('POST honors ?force=true', async () => {
    generateMock.mockResolvedValueOnce(FAKE_NOTE);
    const { POST } = await import('@/app/api/research/[ticker]/route');
    await POST(new Request('http://x/?force=true', { method: 'POST' }),
      { params: Promise.resolve({ ticker: 'EPAM' }) } as any);
    expect(generateMock).toHaveBeenCalledWith('EPAM', 'standard', expect.anything(), { force: true });
  });
});
