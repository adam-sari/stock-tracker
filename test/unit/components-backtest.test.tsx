/**
 * Mount + assertion tests for the four backtest page components.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) =>
    React.createElement('a', { href, className }, children),
}));

import { HeadlineCard } from '@/components/backtest/HeadlineCard';
import { PerSignalGrid } from '@/components/backtest/PerSignalGrid';
import { LiveMonitor } from '@/components/backtest/LiveMonitor';
import { EmptyState } from '@/components/backtest/EmptyState';

const sampleHeadline = {
  horizons: [1, 5, 21, 63],
  composite_ic: {
    '1':  { mean: 0.024, std: 0.1, ir: 0.2, t_stat: 2.15, n: 245, hit_rate: 0.55 },
    '5':  { mean: 0.031, std: 0.1, ir: 0.3, t_stat: 3.41, n: 245, hit_rate: 0.58 },
    '21': { mean: -0.005, std: 0.1, ir: 0.0, t_stat: -0.34, n: 210, hit_rate: 0.49 },
    '63': { mean: 0.018, std: 0.1, ir: 0.1, t_stat: 1.22, n: 168, hit_rate: 0.52 },
  },
};

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('HeadlineCard', () => {
  it('mounts and renders all horizons in the header row', () => {
    render(React.createElement(HeadlineCard, sampleHeadline));
    expect(screen.getByText('1D')).toBeTruthy();
    expect(screen.getByText('5D')).toBeTruthy();
    expect(screen.getByText('21D')).toBeTruthy();
    expect(screen.getByText('63D')).toBeTruthy();
  });

  it('marks t-stat > 3 as significant (✓) and t-stat > 2 as suggestive (⚠)', () => {
    const { container } = render(React.createElement(HeadlineCard, sampleHeadline));
    const txt = container.textContent ?? '';
    expect(txt).toContain('3.41 ✓');
    expect(txt).toContain('2.15 ⚠');
    expect(txt).toContain('-0.34');
  });
});

describe('PerSignalGrid', () => {
  it('mounts and renders each signal row with IC values', () => {
    const perSignal = [
      { kind: 'insider', n_obs: 393, date_range: ['2024-01-01', '2024-12-31'] as [string, string],
        ic: { '1': { mean: 0.041, std: 0.12, ir: 0.3, t_stat: 2.15, n: 245, hit_rate: 0.6 } } },
    ];
    render(React.createElement(PerSignalGrid, { horizons: [1], perSignal }));
    expect(screen.getByText('insider')).toBeTruthy();
    expect(screen.getByText('393')).toBeTruthy();
  });

  it('shows "(no data)" when a known signal kind is absent from per_signal', () => {
    render(React.createElement(PerSignalGrid, { horizons: [1], perSignal: [] }));
    const txt = screen.getAllByText(/no data/i);
    expect(txt.length).toBeGreaterThan(0);
  });
});

describe('LiveMonitor', () => {
  const highest = [{ ticker: 'AVBC', value: 1.00, detail: 'insider' }];
  const mostSignals = [{ ticker: 'AVBC', value: 1, detail: 'insider' }];
  const accelerating = [{ ticker: 'EFOR', value: 0.32, detail: '+0.32' }];

  it('mounts and renders three panel headings', () => {
    render(React.createElement(LiveMonitor, { highest, mostSignals, accelerating }));
    expect(screen.getByText(/HIGHEST SCORE/i)).toBeTruthy();
    expect(screen.getByText(/MOST SIGNALS/i)).toBeTruthy();
    expect(screen.getByText(/ACCELERATING/i)).toBeTruthy();
  });

  it('renders each ticker as a link to /stock/<ticker>', () => {
    render(React.createElement(LiveMonitor, { highest, mostSignals, accelerating }));
    const avbcLink = screen.getAllByText('AVBC')[0].closest('a');
    expect(avbcLink?.getAttribute('href')).toBe('/stock/AVBC');
    const eforLink = screen.getAllByText('EFOR')[0].closest('a');
    expect(eforLink?.getAttribute('href')).toBe('/stock/EFOR');
  });

  it('shows an empty-cell message when a panel has no rows', () => {
    render(React.createElement(LiveMonitor, { highest: [], mostSignals: [], accelerating: [] }));
    const empties = screen.getAllByText(/no scores/i);
    expect(empties.length).toBeGreaterThanOrEqual(3);
  });
});

describe('EmptyState', () => {
  it('mounts and shows the CLI hint', () => {
    render(React.createElement(EmptyState));
    expect(screen.getByText(/uv run python -m sidecar.backtest/i)).toBeTruthy();
  });
});
