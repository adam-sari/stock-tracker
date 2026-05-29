import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import React from 'react';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { BacktestTab } from '@/components/stock/BacktestTab';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function mockFetchOnce(body: any) {
  vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify(body), {
    status: 200,
  }) as any);
}

describe('BacktestTab with PI bands', () => {
  it('renders rows including lower/upper PI columns', async () => {
    mockFetchOnce({
      rows: [
        { date: '2026-04-01', score: 0.9, return_21d: 0.025,
          spy_excess_21d: 0.018, lower_21d: -0.05, upper_21d: 0.08 },
        { date: '2026-03-15', score: 0.7, return_21d: -0.012,
          spy_excess_21d: -0.018, lower_21d: -0.04, upper_21d: 0.06 },
      ],
    });
    render(React.createElement(BacktestTab, { ticker: 'EPAM' }));
    await waitFor(() => expect(screen.getByText(/2026-04-01/)).toBeTruthy());
    expect(screen.getAllByText(/PI/i).length).toBeGreaterThanOrEqual(1);
  });
});
