/**
 * Direct tests for lib/providers/usaspending.ts
 * Tests USASpendingClient HTTP request formation and response parsing,
 * plus the KNOWN_DEFENSE_RECIPIENTS lookup table.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { USASpendingClient, KNOWN_DEFENSE_RECIPIENTS } from '@/lib/providers/usaspending';

function mockFetch(body: unknown, status = 200) {
  vi.spyOn(global, 'fetch').mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response);
}

describe('KNOWN_DEFENSE_RECIPIENTS', () => {
  it('contains major defense contractors', () => {
    expect(KNOWN_DEFENSE_RECIPIENTS['LMT']).toBe('Lockheed Martin Corp');
    expect(KNOWN_DEFENSE_RECIPIENTS['RTX']).toBe('Raytheon Technologies');
    expect(KNOWN_DEFENSE_RECIPIENTS['GD']).toBe('General Dynamics Corp');
    expect(KNOWN_DEFENSE_RECIPIENTS['BA']).toBe('Boeing Co');
    expect(KNOWN_DEFENSE_RECIPIENTS['NOC']).toBe('Northrop Grumman Corp');
  });

  it('has at least 10 entries', () => {
    expect(Object.keys(KNOWN_DEFENSE_RECIPIENTS).length).toBeGreaterThanOrEqual(10);
  });
});

describe('USASpendingClient.searchAwards', () => {
  afterEach(() => vi.restoreAllMocks());

  it('parses a successful API response into USASpendingAward[]', async () => {
    mockFetch({
      results: [
        {
          'Award ID': 'AWARD-001',
          'Recipient Name': 'Lockheed Martin Corp',
          'Description': 'F-35 components',
          'Award Amount': 500_000_000,
          'Action Date': '2026-04-15',
          'Awarding Agency': 'Department of Defense',
        },
        {
          'Award ID': 'AWARD-002',
          'Recipient Name': 'Raytheon Technologies',
          'Description': 'Missile guidance systems',
          'Award Amount': 120_000_000,
          'Action Date': '2026-04-20',
          'Awarding Agency': 'Department of Defense',
        },
      ],
    });

    const client = new USASpendingClient();
    const awards = await client.searchAwards({
      recipientName: 'Lockheed Martin',
      startDate: '2026-04-01',
      endDate: '2026-04-30',
    });

    expect(awards).toHaveLength(2);
    expect(awards[0]).toEqual({
      awardId: 'AWARD-001',
      recipientName: 'Lockheed Martin Corp',
      description: 'F-35 components',
      awardAmount: 500_000_000,
      actionDate: '2026-04-15',
      awardingAgency: 'Department of Defense',
    });
    expect(awards[1].awardId).toBe('AWARD-002');
  });

  it('returns empty array when results are absent', async () => {
    mockFetch({});
    const client = new USASpendingClient();
    const awards = await client.searchAwards({
      recipientName: 'Nonexistent Corp',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
    });
    expect(awards).toEqual([]);
  });

  it('returns empty array when results is an empty array', async () => {
    mockFetch({ results: [] });
    const client = new USASpendingClient();
    const awards = await client.searchAwards({
      recipientName: 'Nobody',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
    });
    expect(awards).toEqual([]);
  });

  it('throws on non-OK HTTP status', async () => {
    mockFetch({ error: 'server error' }, 503);
    const client = new USASpendingClient();
    await expect(
      client.searchAwards({ recipientName: 'LMT', startDate: '2026-01-01', endDate: '2026-01-31' }),
    ).rejects.toThrow('503');
  });

  it('sends a POST request with the correct Content-Type', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    } as Response);

    const client = new USASpendingClient();
    await client.searchAwards({
      recipientName: 'Boeing',
      startDate: '2026-03-01',
      endDate: '2026-03-31',
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/v2/search/spending_by_award/'),
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });

  it('includes recipient_search_text in the request body', async () => {
    let capturedBody: unknown;
    vi.spyOn(global, 'fetch').mockImplementation(async (_url, opts) => {
      capturedBody = JSON.parse((opts as RequestInit).body as string);
      return { ok: true, status: 200, json: async () => ({ results: [] }) } as Response;
    });

    const client = new USASpendingClient();
    await client.searchAwards({
      recipientName: 'Northrop Grumman',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      limit: 50,
      page: 2,
    });

    expect((capturedBody as { filters: { recipient_search_text: string[] } }).filters.recipient_search_text).toEqual([
      'Northrop Grumman',
    ]);
    expect((capturedBody as { limit: number }).limit).toBe(50);
    expect((capturedBody as { page: number }).page).toBe(2);
  });

  it('uses the injected baseUrl', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    } as Response);

    const client = new USASpendingClient('https://test-api.example.com');
    await client.searchAwards({ recipientName: 'Test', startDate: '2026-01-01', endDate: '2026-01-31' });

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://test-api.example.com/api/v2/search/spending_by_award/',
      expect.any(Object),
    );
  });
});
