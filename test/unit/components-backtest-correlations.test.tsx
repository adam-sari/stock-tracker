import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';
import { CorrelationMatrix } from '@/components/backtest/CorrelationMatrix';

const m = {
  signals: ['insider', 'volume'] as any,
  values: [[1.0, 0.42], [0.42, 1.0]],
  ses:    [[0.0, 0.05], [0.05, 0.0]],
  ns:     [[245, 198], [198, 245]],
};

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('CorrelationMatrix', () => {
  it('renders one cell per signal pair with value and SE', () => {
    render(React.createElement(CorrelationMatrix, { title: 'Spearman', matrix: m as any, nThreshold: 30 }));
    expect(screen.getByText('Spearman')).toBeTruthy();
    // 0.42 appears as a text in a cell, possibly followed by significance markers
    const cells = screen.getAllByText(/0\.42/);
    expect(cells.length).toBeGreaterThan(0);
  });

  it('shows NaN cells as "n/a"', () => {
    const sparse = { signals: ['insider', 'volume'] as any,
      values: [[1.0, NaN], [NaN, 1.0]],
      ses:    [[0.0, NaN], [NaN, 0.0]],
      ns:     [[245, 0], [0, 245]],
    };
    render(React.createElement(CorrelationMatrix, { title: 'X', matrix: sparse as any, nThreshold: 30 }));
    expect(screen.getAllByText('n/a').length).toBeGreaterThan(0);
  });

  it('greys out (suppresses color) cells where n < nThreshold (M3)', () => {
    const thin = { signals: ['insider', 'volume'] as any,
      values: [[1.0, 0.65], [0.65, 1.0]],
      ses:    [[0.0, 0.20], [0.20, 0.0]],
      ns:     [[245, 5], [5, 245]],
    };
    const { container } = render(React.createElement(CorrelationMatrix, { title: 'X', matrix: thin as any, nThreshold: 30 }));
    const cells = container.querySelectorAll('td');
    const offDiag = Array.from(cells).find(td => td.textContent?.includes('0.65'));
    expect(offDiag).toBeTruthy();
    expect(offDiag!.className).not.toMatch(/bg-green-/);
  });

  it('marks significant cells with ✓ when |r| > 2 × SE (M3 significance overlay)', () => {
    // r=0.42, SE=0.05 → |t|=8.4 > 2; should render with the marker.
    render(React.createElement(CorrelationMatrix, { title: 'X', matrix: m as any, nThreshold: 30 }));
    expect(screen.getAllByText(/✓/).length).toBeGreaterThan(0);
  });
});
