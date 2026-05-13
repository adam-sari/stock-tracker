import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';

const TEST_DB_DIR = path.join(process.cwd(), '.vitest-cache', 'api-stock');
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test.db');

const routes = [
  ['meta', 'meta'],
  ['news', 'news'],
  ['insiders', 'insiders'],
  ['insider-sentiment', 'insiderSentiment'],
  ['funds', 'funds'],
  ['congress', 'congress'],
  ['sentiment', 'sentiment'],
  ['halts', 'halts'],
  ['earnings', 'earnings'],
  ['recommendations', 'recommendations'],
  ['corporate-actions', 'corporateActions'],
  ['activity', 'events'],
] as const;

describe('GET /api/stock/[ticker]/*', () => {
  beforeEach(() => {
    closeDb();
    if (existsSync(TEST_DB_DIR)) rmSync(TEST_DB_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DB_DIR, { recursive: true });
    process.env.DB_PATH = TEST_DB_PATH;
    applySchema(getDb());
  });
  afterAll(() => { closeDb(); rmSync(TEST_DB_DIR, { recursive: true, force: true }); });

  it.each(routes)('GET /api/stock/AAPL/%s returns 200 with %s key', async (route, key) => {
    const mod = await import(`@/app/api/stock/[ticker]/${route}/route`);
    const res = await mod.GET(new Request(`http://localhost/api/stock/AAPL/${route}`), { params: Promise.resolve({ ticker: 'AAPL' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty(key);
  });
});
