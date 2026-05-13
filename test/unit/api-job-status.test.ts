import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';
import { GET } from '@/app/api/admin/job-status/route';

const TEST_DB_DIR = path.join(process.cwd(), '.vitest-cache', 'api-job-status');
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test.db');

function insertJobRun(job: string, status: string, detail: string, startedAt: number) {
  getDb()
    .prepare(`INSERT INTO job_runs (job, started_at, finished_at, status, detail) VALUES (?, ?, ?, ?, ?)`)
    .run(job, startedAt, startedAt + 1, status, detail);
}

describe('GET /api/admin/job-status', () => {
  beforeEach(() => {
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

  it('returns 200 with an empty jobs array when no runs exist', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jobs).toEqual([]);
  });

  it('returns one row per job with latest run info', async () => {
    insertJobRun('poll_quotes', 'ok', 'AAPL=150', 1_000);
    insertJobRun('poll_quotes', 'ok', 'AAPL=151', 2_000); // newer
    insertJobRun('refresh_congress', 'error', 'timeout', 1_500);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jobs).toHaveLength(2);

    const pq = body.jobs.find((j: { job: string }) => j.job === 'poll_quotes');
    expect(pq).toBeDefined();
    expect(pq.started_at).toBe(2_000); // latest run
    expect(pq.status).toBe('ok');
    expect(pq.detail).toBe('AAPL=151');

    const rc = body.jobs.find((j: { job: string }) => j.job === 'refresh_congress');
    expect(rc.status).toBe('error');
    expect(rc.detail).toBe('timeout');
  });

  it('returns 500 when DB is unavailable', async () => {
    closeDb();
    process.env.DB_PATH = '/nonexistent/path/test.db';
    const res = await GET();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });
});
