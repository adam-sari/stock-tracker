/**
 * Direct tests for lib/providers/open-cabinet.ts
 * Tests OpenCabinetClient.fetchTransactions() HTTP layer.
 * Note: parseAmountBracket and parseFullDataset already have extensive tests
 * in refresh-cabinet-trades.test.ts, so here we focus only on the
 * OpenCabinetClient HTTP fetch method and the OPEN_CABINET_DATA_URL constant.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { OpenCabinetClient, OPEN_CABINET_DATA_URL } from '@/lib/providers/open-cabinet';

const SAMPLE_DATASET = {
  generatedAt: '2026-04-28T00:00:00Z',
  officialCount: 1,
  transactionCount: 1,
  officials: [
    {
      name: 'Smith, John',
      title: 'Secretary of State',
      agency: 'Department of State',
      transactions: [
        {
          description: 'Apple Inc.',
          ticker: 'AAPL',
          type: 'Purchase',
          date: '2026-03-15',
          amount: '$15,001-$50,000',
          lateFilingFlag: false,
        },
      ],
    },
  ],
};

describe('OPEN_CABINET_DATA_URL', () => {
  it('points to the expected URL', () => {
    expect(OPEN_CABINET_DATA_URL).toBe('https://open-cabinet.org/data/full-dataset.json');
  });
});

describe('OpenCabinetClient.fetchTransactions', () => {
  afterEach(() => vi.restoreAllMocks());

  it('fetches and parses the dataset, returning OpenCabinetTransaction[]', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => SAMPLE_DATASET,
    } as Response);

    const client = new OpenCabinetClient();
    const txns = await client.fetchTransactions();

    expect(txns).toHaveLength(1);
    expect(txns[0].ticker).toBe('AAPL');
    expect(txns[0].officialName).toBe('Smith, John');
    expect(txns[0].kind).toBe('Purchase');
    expect(txns[0].amountLow).toBe(15001);
    expect(txns[0].amountHigh).toBe(50000);
  });

  it('throws an Error on non-OK HTTP status', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    } as Response);

    const client = new OpenCabinetClient();
    await expect(client.fetchTransactions()).rejects.toThrow('503');
  });

  it('uses the injected custom dataUrl', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ officials: [] }),
    } as Response);

    const client = new OpenCabinetClient('https://test-cabinet.example.com/data.json');
    await client.fetchTransactions();

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://test-cabinet.example.com/data.json',
      expect.any(Object),
    );
  });

  it('sends User-Agent header', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ officials: [] }),
    } as Response);

    const client = new OpenCabinetClient();
    await client.fetchTransactions();

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ 'User-Agent': expect.stringContaining('stock-tracker') }),
      }),
    );
  });

  it('returns empty array when officials list is absent', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    } as Response);

    const client = new OpenCabinetClient();
    const txns = await client.fetchTransactions();
    expect(txns).toEqual([]);
  });
});
