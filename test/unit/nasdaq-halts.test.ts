import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { NasdaqHaltsClient } from '@/lib/providers/nasdaq-halts';

const xml = readFileSync(path.join(process.cwd(), 'test', 'fixtures', 'nasdaq-halts.xml'), 'utf-8');

describe('NasdaqHaltsClient', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; });

  it('parses the RSS into typed halts', async () => {
    globalThis.fetch = vi.fn(async () => new Response(xml, { status: 200, headers: { 'content-type': 'application/rss+xml' } })) as any;
    const c = new NasdaqHaltsClient();
    const halts = await c.getCurrentHalts();
    expect(halts.length).toBe(2);
    expect(halts[0].ticker).toBe('ASRT');
    expect(halts[0].reasonCode).toBe('LUDP');
    expect(halts[0].haltDate).toBe('2026-05-13');
    expect(halts[1].market).toBe('NYSE');
  });
});
