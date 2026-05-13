import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';
import { createTransaction } from '@/lib/db/queries/transactions';
import { listNewsForTicker } from '@/lib/db/queries/news';
import { refreshNewsOnce } from '@/lib/jobs/refresh-news';
import { FinnhubClient } from '@/lib/providers/finnhub';

const TEST_DB_DIR = path.join(process.cwd(), '.vitest-cache', 'refresh-news');
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test.db');

describe('refreshNewsOnce', () => {
  beforeEach(() => {
    closeDb();
    if (existsSync(TEST_DB_DIR)) rmSync(TEST_DB_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DB_DIR, { recursive: true });
    process.env.DB_PATH = TEST_DB_PATH;
    applySchema(getDb());
  });
  afterAll(() => { closeDb(); rmSync(TEST_DB_DIR, { recursive: true, force: true }); });

  it('fetches news for each held ticker and upserts', async () => {
    createTransaction({ ticker: 'AAPL', kind: 'buy', qty: 10, price: 150, executed_at: '2026-01-01T14:30:00Z' });
    const finnhub = new FinnhubClient({ apiKey: 'k' });
    vi.spyOn(finnhub, 'getCompanyNews').mockResolvedValue([
      { id: '111', headline: 'AAPL news', url: 'https://x/a', source: 'Yahoo', summary: '', publishedAt: 1778600000 },
    ]);
    const r = await refreshNewsOnce(finnhub);
    expect(r.inserted).toBe(1);

    const news = listNewsForTicker('AAPL');
    expect(news.length).toBe(1);
    expect(news[0].headline).toBe('AAPL news');
    expect(news[0].source).toBe('finnhub'); // ingestion source, not article source
  });

  it('idempotent: same news fetched twice produces 1 row', async () => {
    createTransaction({ ticker: 'AAPL', kind: 'buy', qty: 10, price: 150, executed_at: '2026-01-01T14:30:00Z' });
    const finnhub = new FinnhubClient({ apiKey: 'k' });
    vi.spyOn(finnhub, 'getCompanyNews').mockResolvedValue([
      { id: '111', headline: 'AAPL news', url: 'https://x/a', source: 'Yahoo', summary: '', publishedAt: 1778600000 },
    ]);
    await refreshNewsOnce(finnhub);
    await refreshNewsOnce(finnhub);
    expect(listNewsForTicker('AAPL').length).toBe(1);
  });

  it('records job_runs entry', async () => {
    const finnhub = new FinnhubClient({ apiKey: 'k' });
    vi.spyOn(finnhub, 'getCompanyNews').mockResolvedValue([]);
    await refreshNewsOnce(finnhub);
    const job = getDb().prepare(`SELECT * FROM job_runs WHERE job='refresh_news' ORDER BY id DESC LIMIT 1`).get() as { status: string };
    expect(job.status).toBe('ok');
  });
});
