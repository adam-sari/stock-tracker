/**
 * Minimal mount + empty-state tests for dashboard UI components.
 * Goal: catch regressions in mounting and empty-state rendering.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Global mocks
// ---------------------------------------------------------------------------

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) =>
    React.createElement('a', { href, className }, children),
}));

// ---------------------------------------------------------------------------
// AddHoldingDrawer
// ---------------------------------------------------------------------------

import { AddHoldingDrawer } from '@/components/AddHoldingDrawer';

describe('AddHoldingDrawer', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('mounts without crashing and shows the + Add holding button', () => {
    const { container } = render(React.createElement(AddHoldingDrawer, { onCreated: vi.fn() }));
    expect(container.textContent).toContain('+ Add holding');
  });

  it('does not show the form before the button is clicked', () => {
    render(React.createElement(AddHoldingDrawer, { onCreated: vi.fn() }));
    expect(screen.queryByText('Add transaction')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// HoldingsTable
// ---------------------------------------------------------------------------

import { HoldingsTable } from '@/components/HoldingsTable';

describe('HoldingsTable', () => {
  afterEach(() => cleanup());

  it('renders empty-state message when rows is empty', () => {
    render(React.createElement(HoldingsTable, { rows: [] }));
    expect(screen.getByText(/No holdings yet/i)).toBeTruthy();
  });

  it('renders a row for each holding', () => {
    const rows = [
      {
        ticker: 'AAPL',
        qty: 10,
        avg_cost: 150,
        current_price: 170,
        market_value: 1700,
        pnl: 200,
        pnl_pct: 0.1333,
        cost_basis: 1500,
        stale: false,
      },
    ];
    render(React.createElement(HoldingsTable, { rows: rows as any }));
    expect(screen.getByText('AAPL')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// PortfolioSummary
// ---------------------------------------------------------------------------

import { PortfolioSummary } from '@/components/PortfolioSummary';

describe('PortfolioSummary', () => {
  afterEach(() => cleanup());

  it('mounts without crashing and shows portfolio value label', () => {
    const value = { total_value: 10000, total_cost: 9000, total_pnl: 1000, total_pnl_pct: 0.1111, rows: [] };
    render(React.createElement(PortfolioSummary, { value }));
    expect(screen.getByText(/Portfolio value/i)).toBeTruthy();
  });

  it('formats currency values in the output', () => {
    const value = { total_value: 50000, total_cost: 45000, total_pnl: 5000, total_pnl_pct: 0.1111, rows: [] };
    render(React.createElement(PortfolioSummary, { value }));
    expect(screen.getByText(/\$50,000/)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// ProviderHealthBadge
// ---------------------------------------------------------------------------

import { ProviderHealthBadge } from '@/components/ProviderHealthBadge';

describe('ProviderHealthBadge', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders nothing while fetch is pending (rows empty)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const { container } = render(React.createElement(ProviderHealthBadge));
    expect(container.firstChild).toBeNull();
  });

  it('renders provider names when health data arrives', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          providers: [
            { provider: 'yahoo', status: 'ok', last_success: Date.now() / 1000 },
            { provider: 'stooq', status: 'degraded', last_success: null },
          ],
        }),
      }),
    );
    await act(async () => {
      render(React.createElement(ProviderHealthBadge));
    });
    expect(screen.getByText('yahoo')).toBeTruthy();
    expect(screen.getByText('stooq')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// TagsEditor
// ---------------------------------------------------------------------------

import { TagsEditor } from '@/components/TagsEditor';

describe('TagsEditor', () => {
  afterEach(() => cleanup());

  it('mounts without crashing with empty tags', () => {
    const { container } = render(
      React.createElement(TagsEditor, { ticker: 'AAPL', initialTags: [] }),
    );
    expect(container).toBeTruthy();
    expect(screen.getByText('+ tag')).toBeTruthy();
  });

  it('renders existing tags as badge spans', () => {
    render(
      React.createElement(TagsEditor, { ticker: 'MSFT', initialTags: ['growth', 'tech'] }),
    );
    expect(screen.getByText('growth')).toBeTruthy();
    expect(screen.getByText('tech')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// JobHealthBadge
// ---------------------------------------------------------------------------

import { JobHealthBadge } from '@/components/JobHealthBadge';

describe('JobHealthBadge', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders nothing while fetch is pending (jobs empty)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const { container } = render(React.createElement(JobHealthBadge));
    expect(container.firstChild).toBeNull();
  });

  it('renders job summary when job data arrives', async () => {
    const now = Math.floor(Date.now() / 1000);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          jobs: [
            { job: 'poll-quotes', started_at: now, status: 'ok', detail: null, finished_at: now + 5 },
          ],
        }),
      }),
    );
    await act(async () => {
      render(React.createElement(JobHealthBadge));
    });
    expect(screen.getByText(/1 jobs/i)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// RunAllJobsButton
// ---------------------------------------------------------------------------

import { RunAllJobsButton } from '@/components/RunAllJobsButton';

describe('RunAllJobsButton', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('mounts in idle state showing "Run all jobs now" button', () => {
    render(React.createElement(RunAllJobsButton));
    expect(screen.getByText('Run all jobs now')).toBeTruthy();
  });

  it('button is enabled in idle state', () => {
    render(React.createElement(RunAllJobsButton));
    const btn = screen.getByText('Run all jobs now') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });
});
