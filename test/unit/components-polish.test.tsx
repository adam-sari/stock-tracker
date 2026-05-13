/**
 * Minimal mount + empty-state tests for polish UI components.
 * Uses vitest + happy-dom + @testing-library/react.
 * Goal: catch regressions in mounting and empty-state rendering.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Global mocks
// ---------------------------------------------------------------------------

// next/link renders an <a> in tests
vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) =>
    React.createElement('a', { href, className }, children),
}));

// lightweight-charts is a canvas-based charting lib — stub the API
vi.mock('lightweight-charts', () => ({
  createChart: () => ({
    addSeries: () => ({
      setData: vi.fn(),
    }),
    timeScale: () => ({ fitContent: vi.fn() }),
    remove: vi.fn(),
  }),
  AreaSeries: 'AreaSeries',
  LineSeries: 'LineSeries',
  LineStyle: { Dashed: 2 },
  ColorType: { Solid: 'solid' },
}));

// ---------------------------------------------------------------------------
// UpcomingEarnings
// ---------------------------------------------------------------------------

import { UpcomingEarnings } from '@/components/UpcomingEarnings';

describe('UpcomingEarnings', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('mounts without crashing and renders nothing while loading', async () => {
    // Pending fetch — never resolves during this test
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const { container } = render(React.createElement(UpcomingEarnings));
    // Component returns null while loading
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when earnings list is empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({ earnings: [] }),
        ok: true,
      }),
    );

    await act(async () => {
      render(React.createElement(UpcomingEarnings));
    });

    // Component returns null when rows.length === 0
    expect(screen.queryByText(/upcoming earnings/i)).toBeNull();
  });

  it('renders earnings rows when data is present', async () => {
    const future = new Date(Date.now() + 10 * 86400_000);
    const dateStr = future.toISOString().slice(0, 10);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          earnings: [
            { ticker: 'AAPL', earnings_date: dateStr, hour: 'amc', eps_estimate: 1.23, num_estimates: 8 },
          ],
        }),
        ok: true,
      }),
    );

    await act(async () => {
      render(React.createElement(UpcomingEarnings));
    });

    expect(screen.getByText('AAPL')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// WatchlistPanel
// ---------------------------------------------------------------------------

import { WatchlistPanel } from '@/components/WatchlistPanel';

describe('WatchlistPanel', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('mounts without crashing', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const { container } = render(React.createElement(WatchlistPanel));
    // Returns null while loading
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when watchlist is empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ watchlist: [] }),
      }),
    );

    await act(async () => {
      render(React.createElement(WatchlistPanel));
    });

    // Component returns null when items.length === 0
    expect(screen.queryByText(/watchlist/i)).toBeNull();
  });

  it('renders watchlist rows when data is present', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (String(url).includes('/api/watchlist')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              watchlist: [
                { ticker: 'NVDA', added_at: Date.now(), source: 'manual', note: null },
              ],
            }),
          });
        }
        // Price fetch — return stale
        return Promise.resolve({ ok: false, json: async () => ({}) });
      }),
    );

    await act(async () => {
      render(React.createElement(WatchlistPanel));
    });

    expect(screen.getByText('NVDA')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// DashboardActivityFeed
// ---------------------------------------------------------------------------

import { DashboardActivityFeed } from '@/components/DashboardActivityFeed';

// timeAgo helper is used inside DashboardActivityFeed
// It imports from @/lib/time — no mock needed, it should work in happy-dom

describe('DashboardActivityFeed', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('mounts without crashing and shows loading state', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const { container } = render(React.createElement(DashboardActivityFeed));
    expect(container.textContent).toContain('Loading activity');
  });

  it('renders empty state message when events list is empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ events: [] }),
      }),
    );

    await act(async () => {
      render(React.createElement(DashboardActivityFeed));
    });

    expect(screen.getByText(/No activity on your holdings/i)).toBeTruthy();
  });

  it('renders events when data is present', async () => {
    const now = Math.floor(Date.now() / 1000);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          events: [
            {
              ts: now,
              kind: 'news',
              ticker: 'AAPL',
              title: 'Apple earnings beat',
              detail: 'Q2 beat estimates',
              link: 'https://example.com',
              source: 'finnhub',
            },
          ],
        }),
      }),
    );

    await act(async () => {
      render(React.createElement(DashboardActivityFeed));
    });

    expect(screen.getByText('Apple earnings beat')).toBeTruthy();
    expect(screen.getAllByText('AAPL').length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// PortfolioValueChart
// ---------------------------------------------------------------------------

import { PortfolioValueChart } from '@/components/PortfolioValueChart';

describe('PortfolioValueChart', () => {
  afterEach(() => {
    cleanup();
  });

  it('mounts without crashing with empty series', () => {
    const { container } = render(
      React.createElement(PortfolioValueChart, { series: [] }),
    );
    expect(container).toBeTruthy();
  });

  it('renders empty-state message when series is empty', () => {
    render(React.createElement(PortfolioValueChart, { series: [] }));
    expect(screen.getByText(/No portfolio data/i)).toBeTruthy();
  });

  it('renders chart container when series has data', () => {
    const series = [
      { ts: 1714000000, value: 10000, cost_basis: 9000 },
      { ts: 1714086400, value: 10500, cost_basis: 9000 },
    ];
    const { container } = render(
      React.createElement(PortfolioValueChart, { series }),
    );
    // Should NOT show empty-state
    expect(screen.queryByText(/No portfolio data/i)).toBeNull();
    // Should render a div (the chart container)
    expect(container.querySelector('div')).toBeTruthy();
  });
});
