import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';
import { ForecastTermStructure } from '@/components/stock/ForecastTermStructure';

afterEach(() => cleanup());

const SAMPLE = [
  { horizon_days: 1,  point_pred: 0.001, lower: -0.005, upper: 0.007 },
  { horizon_days: 5,  point_pred: 0.005, lower: -0.012, upper: 0.022 },
  { horizon_days: 21, point_pred: 0.020, lower: -0.030, upper: 0.070 },
  { horizon_days: 63, point_pred: 0.040, lower: -0.080, upper: 0.150 },
];

describe('ForecastTermStructure', () => {
  it('renders one labeled bar per horizon', () => {
    render(React.createElement(ForecastTermStructure, { rows: SAMPLE }));
    for (const h of ['1d', '5d', '21d', '63d']) {
      expect(screen.getByText(h)).toBeTruthy();
    }
  });

  it('shows the empty state when rows is empty', () => {
    render(React.createElement(ForecastTermStructure, { rows: [] }));
    expect(screen.getByText(/insufficient data/i)).toBeTruthy();
  });

  it('shows the badge "PID-calibrated" by default and "raw CQR" when prop set', () => {
    const { rerender } = render(React.createElement(ForecastTermStructure, {
      rows: SAMPLE, mode: 'pid',
    }));
    expect(screen.getByText(/PID/)).toBeTruthy();
    rerender(React.createElement(ForecastTermStructure, {
      rows: SAMPLE, mode: 'cqr',
    }));
    expect(screen.getByText(/raw CQR/i)).toBeTruthy();
  });

  it('keeps point_pred visible when it lies outside the PI band', () => {
    const { container } = render(React.createElement(ForecastTermStructure, {
      rows: [
        { horizon_days: 21, point_pred: 0.5, lower: -0.05, upper: 0.05 },
      ],
    }));
    const lines = container.querySelectorAll('svg line');
    // At least the baseline + the point marker should be present
    expect(lines.length).toBeGreaterThanOrEqual(2);
  });
});
