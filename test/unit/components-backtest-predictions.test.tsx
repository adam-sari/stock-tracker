/**
 * Mount + assertion tests for predictions components.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) =>
    React.createElement('a', { href, className }, children),
}));

import { PredictionsTable } from '@/components/backtest/PredictionsTable';
import { HitRateCard } from '@/components/backtest/HitRateCard';
import type { PredictionWithPIRow } from '@/lib/backtest/predictions-queries';

const sampleRows: PredictionWithPIRow[] = [
  {
    date: '2024-05-15', ticker: 'AVBC', signal_kind: 'insider', score: 1.0,
    return_21d: 0.08, spy_excess_21d: 0.05,
    lower_21d: -0.03, upper_21d: 0.09, in_pi_21d: true,
  },
  {
    date: '2024-05-10', ticker: 'NVDA', signal_kind: 'volume', score: 0.85,
    return_21d: null, spy_excess_21d: null,
    lower_21d: null, upper_21d: null, in_pi_21d: null,
  },
];

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('PredictionsTable', () => {
  it('mounts and renders one row per prediction', () => {
    render(React.createElement(PredictionsTable, { rows: sampleRows }));
    expect(screen.getByText('AVBC')).toBeTruthy();
    expect(screen.getByText('NVDA')).toBeTruthy();
  });

  it('links each ticker to /stock/<TICKER>', () => {
    render(React.createElement(PredictionsTable, { rows: sampleRows }));
    const avbcLink = screen.getByText('AVBC').closest('a');
    expect(avbcLink?.getAttribute('href')).toBe('/stock/AVBC');
  });

  it('renders the column headers', () => {
    render(React.createElement(PredictionsTable, { rows: sampleRows }));
    expect(screen.getByText('Date')).toBeTruthy();
    expect(screen.getByText('Ticker')).toBeTruthy();
    expect(screen.getByText('Signal')).toBeTruthy();
    expect(screen.getByText('Score')).toBeTruthy();
    expect(screen.getByText('21D')).toBeTruthy();
    expect(screen.getByText('21d PI')).toBeTruthy();
    expect(screen.getByText('In PI')).toBeTruthy();
  });

  it('renders NULL return cells as em dash', () => {
    const { container } = render(React.createElement(PredictionsTable, { rows: sampleRows }));
    expect(container.textContent).toContain('—');
  });

  it('shows score with 2 decimals', () => {
    render(React.createElement(PredictionsTable, { rows: sampleRows }));
    expect(screen.getByText('1.00')).toBeTruthy();
    expect(screen.getByText('0.85')).toBeTruthy();
  });
});

describe('HitRateCard', () => {
  it('mounts and shows horizon label', () => {
    render(React.createElement(HitRateCard, { horizon: 5, hitRate: 0.58, n: 245, meanSpyExcess: 0.012 }));
    expect(screen.getByText(/5D/i)).toBeTruthy();
  });

  it('shows hit rate as percentage', () => {
    render(React.createElement(HitRateCard, { horizon: 5, hitRate: 0.58, n: 245, meanSpyExcess: 0.012 }));
    expect(screen.getByText(/58%/)).toBeTruthy();
  });

  it('shows n', () => {
    render(React.createElement(HitRateCard, { horizon: 5, hitRate: 0.58, n: 245, meanSpyExcess: 0.012 }));
    expect(screen.getByText(/245/)).toBeTruthy();
  });

  it('applies green class when hit rate >= 55%', () => {
    const { container } = render(React.createElement(HitRateCard, { horizon: 5, hitRate: 0.58, n: 245, meanSpyExcess: 0.012 }));
    expect(container.querySelector('.text-green-400, .text-green-500, .text-green-600, .bg-green-100, .bg-green-200')).toBeTruthy();
  });

  it('applies red class when hit rate < 45%', () => {
    const { container } = render(React.createElement(HitRateCard, { horizon: 5, hitRate: 0.40, n: 245, meanSpyExcess: -0.01 }));
    expect(container.querySelector('.text-red-400, .text-red-500, .text-red-600, .bg-red-100, .bg-red-200')).toBeTruthy();
  });
});
