import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';
import { createTransaction } from '@/lib/db/queries/transactions';
import { addToWatchlist } from '@/lib/db/queries/watchlist';
import { listFdaEvents } from '@/lib/db/queries/fda-calendar';
import { refreshFdaCalendarOnce } from '@/lib/jobs/refresh-fda-calendar';
import { FinnhubClient } from '@/lib/providers/finnhub';

const TEST_DB_DIR = path.join(process.cwd(), '.vitest-cache', 'refresh-fda-calendar');
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test.db');

function makeClient() {
  return new FinnhubClient({ apiKey: 'test-key' });
}

function resetDb() {
  closeDb();
  if (existsSync(TEST_DB_DIR)) rmSync(TEST_DB_DIR, { recursive: true, force: true });
  mkdirSync(TEST_DB_DIR, { recursive: true });
  process.env.DB_PATH = TEST_DB_PATH;
  applySchema(getDb());
}

describe('refreshFdaCalendarOnce', () => {
  beforeEach(() => {
    resetDb();
    vi.restoreAllMocks();
  });

  afterAll(() => {
    closeDb();
    if (existsSync(TEST_DB_DIR)) rmSync(TEST_DB_DIR, { recursive: true, force: true });
  });

  it('stores FDA events for held tickers', async () => {
    createTransaction({ ticker: 'MRNA', kind: 'buy', qty: 5, price: 100, executed_at: '2026-01-01T14:30:00Z' });

    const client = makeClient();
    vi.spyOn(client, 'getFdaCalendar').mockResolvedValue([
      {
        ticker: 'MRNA',
        companyName: 'Moderna Inc.',
        fdaCommittee: 'Vaccines and Related Biological Products',
        eventDescription: 'PDUFA date for mRNA-1345',
        eventDate: '2026-06-15',
      },
    ]);

    const result = await refreshFdaCalendarOnce(client);
    expect(result.stored).toBe(1);
    expect(result.skipped).toBe(false);

    const events = listFdaEvents({ ticker: 'MRNA' });
    expect(events).toHaveLength(1);
    expect(events[0].ticker).toBe('MRNA');
    expect(events[0].company_name).toBe('Moderna Inc.');
    expect(events[0].event_date).toBe('2026-06-15');
  });

  it('stores FDA events for watched tickers', async () => {
    addToWatchlist('BIIB');

    const client = makeClient();
    vi.spyOn(client, 'getFdaCalendar').mockResolvedValue([
      {
        ticker: 'BIIB',
        companyName: 'Biogen Inc.',
        fdaCommittee: 'Peripheral and Central Nervous System Drugs',
        eventDescription: 'Advisory committee meeting',
        eventDate: '2026-07-10',
      },
    ]);

    const result = await refreshFdaCalendarOnce(client);
    expect(result.stored).toBe(1);

    const events = listFdaEvents({ ticker: 'BIIB' });
    expect(events).toHaveLength(1);
  });

  it('skips silently when API returns 403 (paid tier gate)', async () => {
    createTransaction({ ticker: 'MRNA', kind: 'buy', qty: 5, price: 100, executed_at: '2026-01-01T14:30:00Z' });

    const client = makeClient();
    vi.spyOn(client, 'getFdaCalendar').mockResolvedValue(null); // null = 403

    const result = await refreshFdaCalendarOnce(client);
    expect(result.skipped).toBe(true);
    expect(result.stored).toBe(0);

    // Should not throw, job_run should be recorded as 'ok'
    const jobRow = getDb().prepare(`SELECT status, detail FROM job_runs WHERE job='refresh_fda_calendar' ORDER BY id DESC LIMIT 1`).get() as { status: string; detail: string };
    expect(jobRow.status).toBe('ok');
    expect(jobRow.detail).toContain('skipped=403');
  });

  it('filters out events for tickers not in held/watched universe', async () => {
    createTransaction({ ticker: 'MRNA', kind: 'buy', qty: 5, price: 100, executed_at: '2026-01-01T14:30:00Z' });

    const client = makeClient();
    vi.spyOn(client, 'getFdaCalendar').mockResolvedValue([
      {
        ticker: 'NVAX', // Not in portfolio
        companyName: 'Novavax Inc.',
        fdaCommittee: 'Vaccines Advisory',
        eventDescription: 'PDUFA for NVX-CoV2373',
        eventDate: '2026-06-20',
      },
    ]);

    const result = await refreshFdaCalendarOnce(client);
    expect(result.stored).toBe(0);

    const all = listFdaEvents();
    expect(all).toHaveLength(0);
  });

  it('is idempotent — upserts overwrite existing rows', async () => {
    addToWatchlist('MRNA');

    const client = makeClient();
    vi.spyOn(client, 'getFdaCalendar').mockResolvedValue([
      {
        ticker: 'MRNA',
        companyName: 'Moderna Inc.',
        fdaCommittee: 'Vaccines Advisory',
        eventDescription: 'PDUFA date',
        eventDate: '2026-06-15',
      },
    ]);

    await refreshFdaCalendarOnce(client);
    await refreshFdaCalendarOnce(client);

    const events = listFdaEvents({ ticker: 'MRNA' });
    expect(events).toHaveLength(1);
  });
});
