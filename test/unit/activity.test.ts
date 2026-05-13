import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';
import { upsertNews } from '@/lib/db/queries/news';
import { upsertInsiderTxns } from '@/lib/db/queries/insider';
import { listActivityForTicker } from '@/lib/db/queries/activity';
import { upsertFdaEvent } from '@/lib/db/queries/fda-calendar';
import { upsertDodContract } from '@/lib/db/queries/dod-contracts';
import { upsertArkTrades } from '@/lib/db/queries/ark-trades';
import { upsertEdgarAlert } from '@/lib/db/queries/edgar-alerts';

const TEST_DB_DIR = path.join(process.cwd(), '.vitest-cache', 'activity');
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test.db');

describe('listActivityForTicker', () => {
  beforeEach(() => {
    closeDb();
    if (existsSync(TEST_DB_DIR)) rmSync(TEST_DB_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DB_DIR, { recursive: true });
    process.env.DB_PATH = TEST_DB_PATH;
    applySchema(getDb());
  });
  afterAll(() => { closeDb(); rmSync(TEST_DB_DIR, { recursive: true, force: true }); });

  it('mixes events across sources and sorts by ts DESC', () => {
    upsertNews([
      { id: 'n1', ticker: 'AAPL', headline: 'older news', url: 'https://x/n1', source: 'finnhub', published_at: 100, fetched_at: 100 },
      { id: 'n2', ticker: 'AAPL', headline: 'newer news', url: 'https://x/n2', source: 'finnhub', published_at: 300, fetched_at: 300 },
    ]);
    upsertInsiderTxns([
      { id: 'i1', ticker: 'AAPL', insider_name: 'CEO', code: 'P', is_derivative: 0, shares: 100, txn_date: '2026-01-01', filed_at: 200, source: 'edgar' },
    ]);

    const events = listActivityForTicker('AAPL');
    expect(events.length).toBe(3);
    expect(events[0].kind).toBe('news');
    expect(events[0].title).toBe('newer news');
    expect(events[1].kind).toBe('insider');
    expect(events[2].kind).toBe('news');
    expect(events[2].title).toBe('older news');
  });

  it('returns [] for ticker with no data', () => {
    expect(listActivityForTicker('AAPL').length).toBe(0);
  });

  it('includes fda, dod, ark, and edgar_alert events', () => {
    upsertFdaEvent({
      ticker: 'AAPL',
      company_name: 'Apple Inc',
      committee: 'ADCOM',
      description: 'review meeting',
      event_date: '2026-06-01',
      fetched_at: 500,
    });
    upsertDodContract({
      ticker: 'AAPL',
      recipient_name: 'Apple Federal',
      description: 'hardware supply',
      award_amount: 1000000,
      action_date: '2026-05-15',
      agency: 'USAF',
      fetched_at: 600,
    });
    upsertArkTrades([{
      fund: 'ARKK',
      ticker: 'AAPL',
      direction: 'Buy',
      shares: 50000,
      ts: '2026-05-10',
      fetched_at: 700,
    }]);
    upsertEdgarAlert({
      ticker: 'AAPL',
      phrase: 'material weakness',
      filing_url: 'https://sec.gov/abc',
      filing_date: '2026-05-01',
      snippet: 'noted in 10-K',
      fetched_at: 800,
    });

    const events = listActivityForTicker('AAPL');
    const kinds = events.map(e => e.kind);
    expect(kinds).toContain('fda');
    expect(kinds).toContain('dod');
    expect(kinds).toContain('ark');
    expect(kinds).toContain('edgar_alert');
    // fda kind uses strftime conversion — verify title prefix
    const fdaEvent = events.find(e => e.kind === 'fda');
    expect(fdaEvent?.title).toBe('FDA: ADCOM');
    // dod title contains dollar amount
    const dodEvent = events.find(e => e.kind === 'dod');
    expect(dodEvent?.title).toContain('DOD contract: $');
    // ark event title contains fund name and direction
    const arkEvent = events.find(e => e.kind === 'ark');
    expect(arkEvent?.title).toContain('ARK');
    // edgar_alert title uses phrase
    const edgarEvent = events.find(e => e.kind === 'edgar_alert');
    expect(edgarEvent?.title).toBe('EDGAR: material weakness');
    expect(edgarEvent?.link).toBe('https://sec.gov/abc');
  });
});
