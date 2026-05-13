import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';
import { upsertFdaEvent } from '@/lib/db/queries/fda-calendar';
import { upsertDodContract } from '@/lib/db/queries/dod-contracts';
import { upsertArkTrades } from '@/lib/db/queries/ark-trades';
import { upsertEdgarAlert } from '@/lib/db/queries/edgar-alerts';
import { upsertWikiPageviews } from '@/lib/db/queries/wiki-pageviews';
import {
  latestFdaForTicker,
  latestDodForTicker,
  latestArkForTicker,
  latestEdgarAlertForTicker,
  wikiPageviewsTrend,
} from '@/lib/db/queries/reads';
import { GET } from '@/app/api/stock/[ticker]/signals/route';

const TEST_DB_DIR = path.join(process.cwd(), '.vitest-cache', 'api-signals');
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test.db');

describe('GET /api/stock/[ticker]/signals', () => {
  beforeEach(() => {
    closeDb();
    if (existsSync(TEST_DB_DIR)) rmSync(TEST_DB_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DB_DIR, { recursive: true });
    process.env.DB_PATH = TEST_DB_PATH;
    applySchema(getDb());
  });
  afterAll(() => { closeDb(); rmSync(TEST_DB_DIR, { recursive: true, force: true }); });

  it('returns all nulls for ticker with no data', async () => {
    const res = await GET(new Request('http://localhost/api/stock/AAPL/signals'), {
      params: Promise.resolve({ ticker: 'AAPL' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ fda: null, dod: null, ark: null, edgar: null, wiki: null });
  });

  it('returns latest FDA event for ticker', async () => {
    upsertFdaEvent({
      ticker: 'AAPL',
      company_name: 'Apple Inc',
      committee: 'ADCOM',
      description: 'panel review',
      event_date: '2026-07-01',
      fetched_at: 100,
    });
    const res = await GET(new Request('http://localhost/api/stock/AAPL/signals'), {
      params: Promise.resolve({ ticker: 'AAPL' }),
    });
    const body = await res.json();
    expect(body.fda).not.toBeNull();
    expect(body.fda.event_date).toBe('2026-07-01');
    expect(body.fda.committee).toBe('ADCOM');
  });

  it('returns latest DOD contract', async () => {
    upsertDodContract({
      ticker: 'AAPL',
      recipient_name: 'Apple Federal',
      description: 'cloud hardware',
      award_amount: 5000000,
      action_date: '2026-05-10',
      agency: 'USAF',
      fetched_at: 200,
    });
    const res = await GET(new Request('http://localhost/api/stock/AAPL/signals'), {
      params: Promise.resolve({ ticker: 'AAPL' }),
    });
    const body = await res.json();
    expect(body.dod).not.toBeNull();
    expect(body.dod.award_amount).toBe(5000000);
  });

  it('returns latest ARK trade', async () => {
    upsertArkTrades([{
      fund: 'ARKK',
      ticker: 'AAPL',
      direction: 'Buy',
      shares: 100000,
      ts: '2026-05-09',
      fetched_at: 300,
    }]);
    const res = await GET(new Request('http://localhost/api/stock/AAPL/signals'), {
      params: Promise.resolve({ ticker: 'AAPL' }),
    });
    const body = await res.json();
    expect(body.ark).not.toBeNull();
    expect(body.ark.fund).toBe('ARKK');
    expect(body.ark.direction).toBe('Buy');
  });

  it('returns latest EDGAR alert', async () => {
    upsertEdgarAlert({
      ticker: 'AAPL',
      phrase: 'going concern',
      filing_url: 'https://sec.gov/xyz',
      filing_date: '2026-04-20',
      snippet: 'risk factor',
      fetched_at: 400,
    });
    const res = await GET(new Request('http://localhost/api/stock/AAPL/signals'), {
      params: Promise.resolve({ ticker: 'AAPL' }),
    });
    const body = await res.json();
    expect(body.edgar).not.toBeNull();
    expect(body.edgar.phrase).toBe('going concern');
    expect(body.edgar.filing_url).toBe('https://sec.gov/xyz');
  });

  it('returns wiki trend when 14+ days of data available', async () => {
    // Insert 14 days of pageviews: days 1-7 avg=200, days 8-14 avg=100
    const rows = Array.from({ length: 14 }, (_, i) => ({
      ticker: 'AAPL',
      date: `2026-05-${String(14 - i).padStart(2, '0')}`,
      views: i < 7 ? 200 : 100,
    }));
    upsertWikiPageviews(rows);
    const res = await GET(new Request('http://localhost/api/stock/AAPL/signals'), {
      params: Promise.resolve({ ticker: 'AAPL' }),
    });
    const body = await res.json();
    expect(body.wiki).not.toBeNull();
    expect(body.wiki.recent7Avg).toBe(200);
    expect(body.wiki.prior7Avg).toBe(100);
    expect(body.wiki.deltaPct).toBeCloseTo(100, 1);
  });

  it('returns null wiki when fewer than 14 days of data', async () => {
    upsertWikiPageviews([
      { ticker: 'AAPL', date: '2026-05-14', views: 150 },
      { ticker: 'AAPL', date: '2026-05-13', views: 120 },
    ]);
    const res = await GET(new Request('http://localhost/api/stock/AAPL/signals'), {
      params: Promise.resolve({ ticker: 'AAPL' }),
    });
    const body = await res.json();
    expect(body.wiki).toBeNull();
  });
});

describe('query helpers in reads.ts', () => {
  beforeEach(() => {
    closeDb();
    if (existsSync(TEST_DB_DIR)) rmSync(TEST_DB_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DB_DIR, { recursive: true });
    process.env.DB_PATH = TEST_DB_PATH;
    applySchema(getDb());
  });
  afterAll(() => { closeDb(); rmSync(TEST_DB_DIR, { recursive: true, force: true }); });

  it('latestFdaForTicker returns null for empty table', () => {
    expect(latestFdaForTicker('AAPL')).toBeNull();
  });

  it('latestDodForTicker returns null for empty table', () => {
    expect(latestDodForTicker('AAPL')).toBeNull();
  });

  it('latestArkForTicker returns null for empty table', () => {
    expect(latestArkForTicker('AAPL')).toBeNull();
  });

  it('latestEdgarAlertForTicker returns null for empty table', () => {
    expect(latestEdgarAlertForTicker('AAPL')).toBeNull();
  });

  it('wikiPageviewsTrend returns null for empty table', () => {
    expect(wikiPageviewsTrend('AAPL')).toBeNull();
  });
});
