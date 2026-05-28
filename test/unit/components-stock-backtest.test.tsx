import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';
import { CompositeSparkline } from '@/components/stock/CompositeSparkline';

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
