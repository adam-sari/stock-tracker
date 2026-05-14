import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';
import { recordProviderSuccess } from '@/lib/db/queries/health';
import { GET } from '@/app/api/health/route';
import { healthCache } from '@/lib/cache/health-cache';

const TEST_DB_DIR = path.join(process.cwd(), '.vitest-cache', 'health-api-test');
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test.db');

describe('GET /api/health', () => {
  beforeEach(() => {
    healthCache.reset();
    closeDb();
    if (existsSync(TEST_DB_DIR)) rmSync(TEST_DB_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DB_DIR, { recursive: true });
    process.env.DB_PATH = TEST_DB_PATH;
    applySchema(getDb());
  });

  afterAll(() => {
    closeDb();
    rmSync(TEST_DB_DIR, { recursive: true, force: true });
  });

  it('returns 200 with providers array when DB is healthy', async () => {
    recordProviderSuccess('alpaca');
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.providers).toHaveLength(1);
    expect(body.providers[0].provider).toBe('alpaca');
  });

  it('returns 500 when DB query fails', async () => {
    closeDb();
    process.env.DB_PATH = '/nonexistent/locked/path/test.db';
    const res = await GET();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });
});
