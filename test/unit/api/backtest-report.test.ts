import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const TEST_ROOT = path.join(process.cwd(), '.vitest-cache', 'backtest-report-route');
const ORIGINAL_CWD = process.cwd();

function reset() {
  if (existsSync(TEST_ROOT)) rmSync(TEST_ROOT, { recursive: true, force: true });
  mkdirSync(TEST_ROOT, { recursive: true });
  process.chdir(TEST_ROOT);
}

describe('GET /api/backtest/report', () => {
  beforeEach(reset);
  afterEach(() => {
    process.chdir(ORIGINAL_CWD);
    rmSync(TEST_ROOT, { recursive: true, force: true });
  });

  it('returns 404 with a helpful message when no report exists', async () => {
    const { GET } = await import('@/app/api/backtest/report/route');
    const res = await GET();
    expect(res.status).toBe(404);
    const body = await res.text();
    expect(body).toMatch(/python -m sidecar\.backtest/);
  });

  it('returns 200 with HTML content when a report exists', async () => {
    const dir = path.join(TEST_ROOT, 'out', 'backtest', '20260526-120000');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'report.html'), '<!doctype html><h1>fixture report</h1>');
    const { GET } = await import('@/app/api/backtest/report/route');
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const body = await res.text();
    expect(body).toContain('fixture report');
  });

  it('picks the newest timestamped subdir when multiple reports exist', async () => {
    const older = path.join(TEST_ROOT, 'out', 'backtest', '20260526-100000');
    const newer = path.join(TEST_ROOT, 'out', 'backtest', '20260526-120000');
    mkdirSync(older, { recursive: true });
    mkdirSync(newer, { recursive: true });
    writeFileSync(path.join(older, 'report.html'), 'OLDER');
    writeFileSync(path.join(newer, 'report.html'), 'NEWER');
    const { GET } = await import('@/app/api/backtest/report/route');
    const res = await GET();
    const body = await res.text();
    expect(body).toBe('NEWER');
  });
});
