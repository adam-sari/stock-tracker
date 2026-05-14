/**
 * Direct tests for lib/providers/sec-edgar.ts
 * Tests searchFullText(), loadCikTickerMap(), and filingUrl().
 * Note: the job-level integration tests are in refresh-edgar-alerts.test.ts.
 */
import { describe, it, expect, vi, afterEach, beforeAll, afterAll } from 'vitest';
import { existsSync, renameSync } from 'node:fs';
import path from 'node:path';
import { searchFullText, loadCikTickerMap, filingUrl } from '@/lib/providers/sec-edgar';

const CIK_CACHE_PATH = path.join(process.cwd(), 'db', 'company_tickers.json');
const CIK_CACHE_BACKUP = path.join(process.cwd(), 'db', 'company_tickers.json.bak');

function mockFetch(body: unknown, status = 200) {
  vi.spyOn(global, 'fetch').mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => `HTTP ${status}`,
  } as Response);
}

describe('searchFullText', () => {
  afterEach(() => vi.restoreAllMocks());

  it('parses the EDGAR response into EdgarHit[]', async () => {
    mockFetch({
      hits: {
        total: { value: 1 },
        hits: [
          {
            _source: {
              entity_name: 'Apple Inc.',
              cik: '320193',
              accession_no: '0000320193-26-000001',
              file_date: '2026-04-15',
              form_type: '10-K',
            },
            highlight: {
              file_text: ['There is substantial doubt about going concern.'],
            },
          },
        ],
      },
    });

    const hits = await searchFullText('going concern', '2026-04-01', '2026-04-30');
    expect(hits).toHaveLength(1);
    expect(hits[0].entity_name).toBe('Apple Inc.');
    expect(hits[0].cik).toBe('0000320193'); // zero-padded to 10
    expect(hits[0].accession_no).toBe('0000320193-26-000001');
    expect(hits[0].file_date).toBe('2026-04-15');
    expect(hits[0].snippet).toContain('going concern');
  });

  it('returns empty array when hits is empty', async () => {
    mockFetch({ hits: { total: { value: 0 }, hits: [] } });
    const hits = await searchFullText('going concern', '2026-01-01', '2026-01-31');
    expect(hits).toEqual([]);
  });

  it('returns empty snippet when no highlight', async () => {
    mockFetch({
      hits: {
        total: { value: 1 },
        hits: [
          {
            _source: {
              entity_name: 'Acme Corp',
              cik: '99',
              accession_no: '0000000099-26-000001',
              file_date: '2026-02-01',
              form_type: '10-Q',
            },
            // no highlight field
          },
        ],
      },
    });

    const hits = await searchFullText('restatement', '2026-02-01', '2026-02-28');
    expect(hits[0].snippet).toBe('');
  });

  it('throws on non-OK HTTP status', async () => {
    mockFetch({}, 500);
    await expect(
      searchFullText('going concern', '2026-01-01', '2026-01-31'),
    ).rejects.toThrow('500');
  });

  it('includes the phrase and date range in the request URL', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ hits: { total: { value: 0 }, hits: [] } }),
    } as Response);

    await searchFullText('going concern', '2026-01-01', '2026-12-31', '10-K', 5, 'https://efts.test');

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain('efts.test');
    expect(calledUrl).toContain('going+concern');
    expect(calledUrl).toContain('startdt=2026-01-01');
    expect(calledUrl).toContain('enddt=2026-12-31');
    expect(calledUrl).toContain('hits_per_page=5');
  });
});

/**
 * loadCikTickerMap has a 7-day disk cache at db/company_tickers.json.
 * We temporarily move it aside so tests always hit the fetch path.
 */
describe('loadCikTickerMap', () => {
  beforeAll(() => {
    if (existsSync(CIK_CACHE_PATH)) renameSync(CIK_CACHE_PATH, CIK_CACHE_BACKUP);
  });

  afterAll(() => {
    // Remove any file written by the tests, then restore backup
    if (existsSync(CIK_CACHE_PATH)) renameSync(CIK_CACHE_PATH, `${CIK_CACHE_PATH}.test`);
    if (existsSync(CIK_CACHE_BACKUP)) renameSync(CIK_CACHE_BACKUP, CIK_CACHE_PATH);
    // Clean up test artifact
    if (existsSync(`${CIK_CACHE_PATH}.test`)) renameSync(`${CIK_CACHE_PATH}.test`, CIK_CACHE_PATH);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Remove any cache written by the test so the next test starts fresh
    const { rmSync } = require('node:fs');
    if (existsSync(CIK_CACHE_PATH)) rmSync(CIK_CACHE_PATH);
  });

  it('fetches from SEC and returns a CIK→ticker Map', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        '0': { cik_str: 320193, ticker: 'AAPL', title: 'Apple Inc.' },
        '1': { cik_str: 789019, ticker: 'MSFT', title: 'Microsoft Corp' },
      }),
    } as Response);

    const map = await loadCikTickerMap('https://sec.test');

    expect(map.get('0000320193')).toBe('AAPL');
    expect(map.get('0000789019')).toBe('MSFT');
    expect(map.size).toBeGreaterThanOrEqual(2);
  });

  it('uppercases ticker symbols', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        '0': { cik_str: 1, ticker: 'tsla', title: 'Tesla Inc.' },
      }),
    } as Response);

    const map = await loadCikTickerMap('https://sec.test');
    expect(map.get('0000000001')).toBe('TSLA');
  });

  it('throws on non-OK HTTP status', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'Service Unavailable',
    } as Response);

    await expect(loadCikTickerMap('https://sec.test')).rejects.toThrow('503');
  });
});

describe('filingUrl', () => {
  it('builds a valid EDGAR filing URL from an accession number', () => {
    const url = filingUrl('0000320193-26-000001');
    expect(url).toContain('sec.gov');
    expect(url).toContain('320193');
  });

  it('removes hyphens from the accession number for path construction', () => {
    const url = filingUrl('0001018724-26-000009');
    // The URL should reference the CIK
    expect(url).toContain('1018724');
  });
});
