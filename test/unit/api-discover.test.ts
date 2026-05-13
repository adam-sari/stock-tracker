import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';
import { upsertDiscoveryScore } from '@/lib/db/queries/discovery';
import { GET } from '@/app/api/discover/route';

const TEST_DB_DIR = path.join(process.cwd(), '.vitest-cache', 'api-discover');
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test.db');

describe('GET /api/discover', () => {
  beforeEach(() => {
    closeDb();
    if (existsSync(TEST_DB_DIR)) rmSync(TEST_DB_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DB_DIR, { recursive: true });
    process.env.DB_PATH = TEST_DB_PATH;
    applySchema(getDb());
  });
  afterAll(() => { closeDb(); rmSync(TEST_DB_DIR, { recursive: true, force: true }); });

  it('returns ranked items', async () => {
    upsertDiscoveryScore({ ticker: 'AAA', score: 0.9, signals_json: JSON.stringify([{ kind: 'insider' }]), computed_at: 1 });
    upsertDiscoveryScore({ ticker: 'BBB', score: 0.3, signals_json: JSON.stringify([{ kind: 'congress' }]), computed_at: 1 });
    const res = await GET(new Request('http://x/api/discover'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items[0].ticker).toBe('AAA');
  });

  it('filters by signals param', async () => {
    upsertDiscoveryScore({ ticker: 'AAA', score: 0.9, signals_json: JSON.stringify([{ kind: 'insider' }]), computed_at: 1 });
    upsertDiscoveryScore({ ticker: 'BBB', score: 0.3, signals_json: JSON.stringify([{ kind: 'congress' }]), computed_at: 1 });
    const res = await GET(new Request('http://x/api/discover?signals=congress'));
    const body = await res.json();
    expect(body.items.length).toBe(1);
    expect(body.items[0].ticker).toBe('BBB');
  });
});
