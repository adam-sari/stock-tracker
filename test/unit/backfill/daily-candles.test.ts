import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';
import { backfillDailyCandles, type BarFetcher } from '@/lib/backfill/daily-candles';

const TEST_DB_DIR = path.join(process.cwd(), '.vitest-cache', 'backfill-candles');
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test.db');

function resetDb() {
  closeDb();
  if (existsSync(TEST_DB_DIR)) rmSync(TEST_DB_DIR, { recursive: true, force: true });
  mkdirSync(TEST_DB_DIR, { recursive: true });
  process.env.DB_PATH = TEST_DB_PATH;
  applySchema(getDb());
}

describe('backfillDailyCandles', () => {
  beforeEach(resetDb);
  afterAll(() => { closeDb(); rmSync(TEST_DB_DIR, { recursive: true, force: true }); });

  it('inserts bars from the fetcher into candles_daily', async () => {
    const fetcher: BarFetcher = vi.fn().mockResolvedValue({
      bars: {
        AAPL: [
          { t: '2024-01-02T00:00:00Z', o: 100, h: 101, l: 99, c: 100.5, v: 1_000_000 },
          { t: '2024-01-03T00:00:00Z', o: 100.5, h: 102, l: 100, c: 101.5, v: 1_100_000 },
        ],
      },
      next_page_token: null,
    });
    const n = await backfillDailyCandles(['AAPL'], '2024-01-02', '2024-01-03', fetcher);
    expect(n).toBe(2);
    const row = getDb().prepare(`SELECT close FROM candles_daily WHERE ticker='AAPL' AND date='2024-01-03'`).get() as { close: number };
    expect(row.close).toBe(101.5);
  });

  it('is idempotent: running twice upserts without dupes', async () => {
    const fetcher: BarFetcher = vi.fn().mockResolvedValue({
      bars: { AAPL: [{ t: '2024-01-02T00:00:00Z', o: 100, h: 101, l: 99, c: 100.5, v: 1_000_000 }] },
      next_page_token: null,
    });
    await backfillDailyCandles(['AAPL'], '2024-01-02', '2024-01-02', fetcher);
    await backfillDailyCandles(['AAPL'], '2024-01-02', '2024-01-02', fetcher);
    const count = getDb().prepare(`SELECT COUNT(*) AS n FROM candles_daily WHERE ticker='AAPL'`).get() as { n: number };
    expect(count.n).toBe(1);
  });

  it('paginates when next_page_token is returned', async () => {
    const fetcher: BarFetcher = vi.fn()
      .mockResolvedValueOnce({
        bars: { AAPL: [{ t: '2024-01-02T00:00:00Z', o: 1, h: 1, l: 1, c: 1, v: 1 }] },
        next_page_token: 'page2',
      })
      .mockResolvedValueOnce({
        bars: { AAPL: [{ t: '2024-01-03T00:00:00Z', o: 2, h: 2, l: 2, c: 2, v: 2 }] },
        next_page_token: null,
      });
    const n = await backfillDailyCandles(['AAPL'], '2024-01-02', '2024-01-03', fetcher);
    expect(n).toBe(2);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect((fetcher as any).mock.calls[1][0]).toMatchObject({ pageToken: 'page2' });
  });

  it('records a job_runs row with status=ok on success', async () => {
    const fetcher: BarFetcher = vi.fn().mockResolvedValue({ bars: {}, next_page_token: null });
    await backfillDailyCandles(['AAPL'], '2024-01-02', '2024-01-02', fetcher);
    const job = getDb().prepare(`SELECT job, status FROM job_runs WHERE job='backfill_daily_candles' ORDER BY id DESC LIMIT 1`).get() as { job: string; status: string };
    expect(job.status).toBe('ok');
  });
});
