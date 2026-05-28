import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) =>
    React.createElement('a', { href, className }, children),
}));

import { SimPnLTable } from '@/components/watchlist/SimPnLTable';
import { SimPnLSummary } from '@/components/watchlist/SimPnLSummary';
import type { SimRow, SimAggregate } from '@/lib/watchlist/sim-pnl';

const row = (over: Partial<SimRow> = {}): SimRow => ({
  ticker: 'AAPL', status: 'active',
  entryDate: '2024-01-02', entryClose: 100, splitAdjFactor: 1,
  exitDate: '2024-12-31', exitClose: 150,
  returnPct: 0.5, spyEntryClose: 400, spyExitClose: 440,
  spyReturnPct: 0.1, spyExcessPct: 0.4, daysHeld: 364, delistDate: null,
  ...over,
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('SimPnLTable', () => {
  it('renders one row per ticker with ticker linked to /stock/<ticker>', () => {
    render(React.createElement(SimPnLTable, { rows: [row({ ticker: 'AAPL' }), row({ ticker: 'NVDA' })] }));
    const aaplLink = screen.getByText('AAPL').closest('a');
    expect(aaplLink?.getAttribute('href')).toBe('/stock/AAPL');
    const nvdaLink = screen.getByText('NVDA').closest('a');
    expect(nvdaLink?.getAttribute('href')).toBe('/stock/NVDA');
  });

  it('shows empty-state message when no rows', () => {
    render(React.createElement(SimPnLTable, { rows: [] }));
    expect(screen.getByText(/empty or has no price coverage/i)).toBeTruthy();
  });

  it('marks delisted rows with the delist date', () => {
    render(React.createElement(SimPnLTable, { rows: [row({ ticker: 'DELC', status: 'delisted', delistDate: '2024-03-15' })] }));
    expect(screen.getByText(/delisted 2024-03-15/i)).toBeTruthy();
  });

  it('marks stale rows distinctly from active and delisted', () => {
    render(React.createElement(SimPnLTable, { rows: [row({ ticker: 'HALT', status: 'stale', exitDate: '2024-02-01' })] }));
    expect(screen.getByText(/stale/i)).toBeTruthy();
  });
});

describe('SimPnLSummary', () => {
  const agg = (over: Partial<SimAggregate> = {}): SimAggregate => ({
    n: 2,
    perTickerMean: { returnPct: 0.25, spyExcessPct: 0.15, hitRate: 0.5 },
    portfolio:     { activeN: 2, returnPct: 0.20, spyExcessPct: 0.10 },
    ...over,
  });

  it('renders both per-ticker mean and portfolio aggregates', () => {
    render(React.createElement(SimPnLSummary, { aggregate: agg(), asOfDate: '2024-12-31' }));
    expect(screen.getByText(/25\.00%/)).toBeTruthy();
    expect(screen.getByText(/20\.00%/)).toBeTruthy();
    expect(screen.getByText(/as of/i)).toBeTruthy();
    expect(screen.getByText('2024-12-31')).toBeTruthy();
  });

  it('renders nothing when n=0', () => {
    const { container } = render(React.createElement(SimPnLSummary, { aggregate: agg({ n: 0 }), asOfDate: '2024-12-31' }));
    expect(container.textContent).toBe('');
  });
});
