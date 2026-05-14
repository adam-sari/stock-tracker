/**
 * Direct tests for lib/providers/hiring.ts
 * Tests HiringClient HTTP parsing for both Greenhouse and Lever ATS formats.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { HiringClient, TECH_ATS_MAP } from '@/lib/providers/hiring';

function mockFetch(body: unknown, status = 200) {
  vi.spyOn(global, 'fetch').mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response);
}

describe('TECH_ATS_MAP', () => {
  it('contains expected well-known tech tickers', () => {
    expect(TECH_ATS_MAP['SNOW']).toEqual({ ats: 'greenhouse', slug: 'snowflake' });
    expect(TECH_ATS_MAP['DDOG']).toEqual({ ats: 'greenhouse', slug: 'datadog' });
    expect(TECH_ATS_MAP['NET']).toEqual({ ats: 'greenhouse', slug: 'cloudflare' });
    expect(TECH_ATS_MAP['CRWD']).toEqual({ ats: 'greenhouse', slug: 'crowdstrike' });
  });

  it('all entries use greenhouse or lever as the ats type', () => {
    for (const entry of Object.values(TECH_ATS_MAP)) {
      expect(['greenhouse', 'lever']).toContain(entry.ats);
    }
  });
});

describe('HiringClient.getJobs — Greenhouse', () => {
  afterEach(() => vi.restoreAllMocks());

  it('parses a Greenhouse response into HiringJob[]', async () => {
    mockFetch({
      jobs: [
        { id: 1, title: 'Software Engineer', location: { name: 'New York, NY' } },
        { id: 2, title: 'Product Manager', location: { name: 'San Francisco, CA' } },
        { id: 3, title: 'Data Analyst' },
      ],
    });

    const client = new HiringClient();
    const jobs = await client.getJobs('datadog', 'greenhouse');

    expect(jobs).toHaveLength(3);
    expect(jobs[0]).toEqual({ id: 1, title: 'Software Engineer', location: 'New York, NY' });
    expect(jobs[1]).toEqual({ id: 2, title: 'Product Manager', location: 'San Francisco, CA' });
    // Missing location → undefined
    expect(jobs[2].location).toBeUndefined();
  });

  it('returns empty array when jobs list is empty', async () => {
    mockFetch({ jobs: [] });
    const client = new HiringClient();
    const jobs = await client.getJobs('unknownco', 'greenhouse');
    expect(jobs).toEqual([]);
  });

  it('throws on non-OK HTTP status', async () => {
    mockFetch({ message: 'Not Found' }, 404);
    const client = new HiringClient();
    await expect(client.getJobs('bogus-slug', 'greenhouse')).rejects.toThrow('404');
  });

  it('defaults to greenhouse ats when no ats argument given', async () => {
    const fetchSpy = mockFetch({ jobs: [{ id: 10, title: 'Engineer' }] });
    const client = new HiringClient('https://boards-api.greenhouse.io');
    await client.getJobs('snowflake');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('greenhouse.io'),
      expect.any(Object),
    );
  });

  it('uses the injected baseUrlGreenhouse', async () => {
    mockFetch({ jobs: [] });
    const client = new HiringClient('https://test-greenhouse.example.com');
    await client.getJobs('mycompany', 'greenhouse');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://test-greenhouse.example.com/v1/boards/mycompany/jobs',
      expect.any(Object),
    );
  });
});

describe('HiringClient.getJobs — Lever', () => {
  afterEach(() => vi.restoreAllMocks());

  it('parses a Lever response into HiringJob[]', async () => {
    mockFetch([
      { id: 'uuid-1', text: 'Backend Engineer', categories: { location: 'Remote' } },
      { id: 'uuid-2', text: 'Frontend Engineer' },
    ]);

    const client = new HiringClient(
      'https://boards-api.greenhouse.io',
      'https://api.lever.co',
    );
    const jobs = await client.getJobs('mycompany', 'lever');

    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toEqual({ id: 'uuid-1', title: 'Backend Engineer', location: 'Remote' });
    expect(jobs[1].location).toBeUndefined();
  });

  it('throws on non-OK Lever HTTP status', async () => {
    mockFetch({}, 500);
    const client = new HiringClient();
    await expect(client.getJobs('myco', 'lever')).rejects.toThrow('500');
  });

  it('uses the injected baseUrlLever', async () => {
    mockFetch([]);
    const client = new HiringClient(
      'https://boards-api.greenhouse.io',
      'https://test-lever.example.com',
    );
    await client.getJobs('mycompany', 'lever');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://test-lever.example.com/v0/postings/mycompany',
      expect.any(Object),
    );
  });
});
