import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import React from 'react';
import { CompositeSparkline } from '@/components/stock/CompositeSparkline';
import { BacktestHistoryTable } from '@/components/stock/BacktestHistoryTable';
import { BacktestTab } from '@/components/stock/BacktestTab';

afterEach(cleanup);

describe('CompositeSparkline', () => {
  it('shows insufficient-data span when <2 points', () => {
    render(React.createElement(CompositeSparkline, { points: [] }));
    expect(screen.getByText(/insufficient data/i)).toBeTruthy();
    cleanup();
    render(React.createElement(CompositeSparkline, { points: [{ date: '2026-05-21', compositeScore: 0.5 }] }));
    expect(screen.getByText(/insufficient data/i)).toBeTruthy();
  });

  it('renders SVG with aria-label and viewBox when >=2 points', () => {
    const points = [
      { date: '2026-05-20', compositeScore: 0.4 },
      { date: '2026-05-21', compositeScore: 0.8 },
    ];
    const { container } = render(React.createElement(CompositeSparkline, { points }));
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg!.getAttribute('aria-label')).toMatch(/sparkline/i);
    expect(svg!.getAttribute('viewBox')).toBeTruthy();
  });

  it('does not produce NaN when all points have identical scores (range=0)', () => {
    const points = [
      { date: '2026-05-20', compositeScore: 0.5 },
      { date: '2026-05-21', compositeScore: 0.5 },
    ];
    const { container } = render(React.createElement(CompositeSparkline, { points }));
    const d = container.querySelector('path')!.getAttribute('d')!;
    expect(d).not.toMatch(/NaN/);
  });
});

describe('BacktestHistoryTable', () => {
  it('renders empty-state message when rows is empty', () => {
    render(React.createElement(BacktestHistoryTable, { rows: [], ticker: 'AAPL', inUniverse: true }));
    expect(screen.getByText(/no backtest scores yet/i)).toBeTruthy();
  });

  it('shows distinct delisted-ticker empty-state when inUniverse=false', () => {
    render(React.createElement(BacktestHistoryTable, { rows: [], ticker: 'DEAD', inUniverse: false }));
    expect(screen.getByText(/not in the backtest universe/i)).toBeTruthy();
  });

  it('renders one row per date with — for missing signals', () => {
    const rows = [
      { date: '2026-05-21', ticker: 'AAPL', signal_kind: 'insider', score: 0.8, detail_json: '{}' },
    ];
    render(React.createElement(BacktestHistoryTable, { rows, ticker: 'AAPL', inUniverse: true }));
    expect(screen.getByText('2026-05-21')).toBeTruthy();
    expect(screen.getByText('0.80')).toBeTruthy();
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBe(5);
  });
});

describe('BacktestTab', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('shows skeleton initially', () => {
    (globalThis.fetch as any).mockReturnValue(new Promise(() => {}));
    const { container } = render(React.createElement(BacktestTab, { ticker: 'AAPL' }));
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('renders empty state when fetch returns empty history', async () => {
    (globalThis.fetch as any).mockResolvedValue({ json: async () => ({ history: [] }) });
    render(React.createElement(BacktestTab, { ticker: 'AAPL' }));
    await waitFor(() => expect(screen.getByText(/no backtest scores/i)).toBeTruthy());
  });

  it('renders history table + sparkline when fetch returns data', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      json: async () => ({
        history: [
          { date: '2026-05-21', ticker: 'AAPL', signal_kind: 'insider', score: 0.8, detail_json: '{}' },
          { date: '2026-05-20', ticker: 'AAPL', signal_kind: 'insider', score: 0.4, detail_json: '{}' },
        ],
      }),
    });
    render(React.createElement(BacktestTab, { ticker: 'AAPL' }));
    await waitFor(() => expect(screen.getByText('2026-05-21')).toBeTruthy());
    expect(screen.getByLabelText(/sparkline/i)).toBeTruthy();
  });

  it('calls /api/stock/AAPL/backtest-history on mount', async () => {
    (globalThis.fetch as any).mockResolvedValue({ json: async () => ({ history: [] }) });
    render(React.createElement(BacktestTab, { ticker: 'AAPL' }));
    await waitFor(() => expect((globalThis.fetch as any).mock.calls[0][0]).toBe('/api/stock/AAPL/backtest-history'));
  });
});
