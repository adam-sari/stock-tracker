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
  it('renders PI column inside the single per-date table', async () => {
    mockFetchOnce({
      rows: [
        { date: '2026-04-01', score: 0.9, return_21d: 0.025,
          spy_excess_21d: 0.018, lower_21d: -0.05, upper_21d: 0.08 },
        { date: '2026-03-15', score: 0.7, return_21d: -0.012,
          spy_excess_21d: -0.018, lower_21d: -0.04, upper_21d: 0.06 },
      ],
    });
    render(React.createElement(BacktestTab, { ticker: 'EPAM' }));
    await waitFor(() => expect(screen.getByText('2026-04-01')).toBeTruthy());
    // PI header present in the single table
    expect(screen.getAllByText(/21d PI/i).length).toBeGreaterThanOrEqual(1);
    // PI values rendered as [lower%, upper%]
    expect(screen.getByText('[-5.0%, 8.0%]')).toBeTruthy();
    expect(screen.getByText('[-4.0%, 6.0%]')).toBeTruthy();
  });

  it('renders em-dash fallback when PI is null', async () => {
    mockFetchOnce({
      rows: [
        { date: '2026-04-01', score: 0.9, return_21d: 0.025,
          spy_excess_21d: 0.018, lower_21d: null, upper_21d: null },
      ],
    });
    render(React.createElement(BacktestTab, { ticker: 'AAPL' }));
    await waitFor(() => expect(screen.getByText('2026-04-01')).toBeTruthy());
    // em-dash shown in the PI cell (there may be multiple em-dashes for null return too,
    // so just assert at least one exists in the rendered table)
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });
});
