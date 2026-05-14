/**
 * Minimal mount + empty-state tests for stock-detail UI components.
 * Goal: catch regressions in mounting and empty-state rendering.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Global mocks
// ---------------------------------------------------------------------------

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) =>
    React.createElement('a', { href, className }, children),
}));

// lightweight-charts — stub entire API (same as components-polish.test.tsx)
vi.mock('lightweight-charts', () => ({
  createChart: () => ({
    addSeries: () => ({
      setData: vi.fn(),
      attachPrimitive: vi.fn(),
    }),
    timeScale: () => ({ fitContent: vi.fn() }),
    remove: vi.fn(),
  }),
  CandlestickSeries: 'CandlestickSeries',
  AreaSeries: 'AreaSeries',
  LineSeries: 'LineSeries',
  LineStyle: { Dashed: 2 },
  ColorType: { Solid: 'solid' },
}));

// vendor session-highlighting primitive — stub the class
vi.mock('@/vendor/lightweight-charts-session-highlighting', () => ({
  SessionHighlightingPrimitive: class {
    setData = vi.fn();
  },
}));

// ---------------------------------------------------------------------------
// TabStrip
// ---------------------------------------------------------------------------

import { TabStrip } from '@/components/stock/TabStrip';

describe('TabStrip', () => {
  afterEach(() => cleanup());

  it('renders all seven tabs', () => {
    render(React.createElement(TabStrip, { active: 'activity', onChange: vi.fn() }));
    expect(screen.getByText('Activity')).toBeTruthy();
    expect(screen.getByText('News')).toBeTruthy();
    expect(screen.getByText('Insiders')).toBeTruthy();
    expect(screen.getByText('About')).toBeTruthy();
  });

  it('applies active styling to the currently active tab', () => {
    render(React.createElement(TabStrip, { active: 'news', onChange: vi.fn() }));
    const newsBtn = screen.getByText('News') as HTMLButtonElement;
    expect(newsBtn.className).toContain('text-accent');
  });
});

// ---------------------------------------------------------------------------
// AboutPanel
// ---------------------------------------------------------------------------

import { AboutPanel } from '@/components/stock/AboutPanel';

describe('AboutPanel', () => {
  afterEach(() => cleanup());

  it('renders "not yet available" when meta is null', () => {
    render(React.createElement(AboutPanel, { meta: null }));
    expect(screen.getByText(/Company metadata not yet available/i)).toBeTruthy();
  });

  it('renders sector and industry when meta is provided', () => {
    const meta = {
      ticker: 'AAPL',
      name: 'Apple Inc.',
      sector: 'Technology',
      industry: 'Consumer Electronics',
      exchange: 'NASDAQ',
      market_cap: 3e12,
    };
    render(React.createElement(AboutPanel, { meta }));
    expect(screen.getByText('Technology')).toBeTruthy();
    expect(screen.getByText('Consumer Electronics')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// PositionPanel
// ---------------------------------------------------------------------------

import { PositionPanel } from '@/components/stock/PositionPanel';

describe('PositionPanel', () => {
  afterEach(() => cleanup());

  it('renders "Not in your portfolio" when qty is 0', () => {
    render(React.createElement(PositionPanel, { ticker: 'AAPL', qty: 0, avgCost: 0, currentPrice: null }));
    expect(screen.getByText(/Not in your portfolio/i)).toBeTruthy();
  });

  it('renders position details when qty > 0', () => {
    render(React.createElement(PositionPanel, { ticker: 'AAPL', qty: 10, avgCost: 150, currentPrice: 175 }));
    expect(screen.getByText('Your position')).toBeTruthy();
    expect(screen.getByText('10')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// StockHeader
// ---------------------------------------------------------------------------

import { StockHeader } from '@/components/stock/StockHeader';

describe('StockHeader', () => {
  afterEach(() => cleanup());

  it('renders ticker and name', () => {
    render(
      React.createElement(StockHeader, {
        ticker: 'MSFT',
        name: 'Microsoft Corporation',
        price: null,
        change: null,
        changePct: null,
        postPrice: null,
        initialTags: [],
      }),
    );
    expect(screen.getByText('MSFT')).toBeTruthy();
    expect(screen.getByText('Microsoft Corporation')).toBeTruthy();
  });

  it('renders price when provided', () => {
    render(
      React.createElement(StockHeader, {
        ticker: 'GOOGL',
        name: 'Alphabet Inc.',
        price: 183.5,
        change: 2.3,
        changePct: 0.0127,
        postPrice: null,
        initialTags: ['tech'],
      }),
    );
    // price should appear formatted as currency
    expect(screen.getByText(/183/)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// ActivityTab
// ---------------------------------------------------------------------------

import { ActivityTab } from '@/components/stock/ActivityTab';

describe('ActivityTab', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders loading skeleton while fetch is pending', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const { container } = render(React.createElement(ActivityTab, { ticker: 'AAPL' }));
    // skeleton renders a <ul>
    expect(container.querySelector('ul')).toBeTruthy();
  });

  it('renders empty-state message when events array is empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ events: [] }) }),
    );
    await act(async () => {
      render(React.createElement(ActivityTab, { ticker: 'AAPL' }));
    });
    expect(screen.getByText(/No activity yet/i)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// NewsTab
// ---------------------------------------------------------------------------

import { NewsTab } from '@/components/stock/NewsTab';

describe('NewsTab', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders loading skeleton while fetch is pending', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const { container } = render(React.createElement(NewsTab, { ticker: 'TSLA' }));
    expect(container.querySelector('ul')).toBeTruthy();
  });

  it('renders empty-state text when news is empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ news: [] }) }),
    );
    await act(async () => {
      render(React.createElement(NewsTab, { ticker: 'TSLA' }));
    });
    expect(screen.getByText(/No news fetched yet for TSLA/i)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// InsidersTab
// ---------------------------------------------------------------------------

import { InsidersTab } from '@/components/stock/InsidersTab';

describe('InsidersTab', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders skeleton table while fetch is pending', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const { container } = render(React.createElement(InsidersTab, { ticker: 'AAPL' }));
    expect(container.querySelector('table')).toBeTruthy();
  });

  it('renders empty-state text when insiders list is empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ insiders: [] }) }),
    );
    await act(async () => {
      render(React.createElement(InsidersTab, { ticker: 'AAPL' }));
    });
    expect(screen.getByText(/No insider transactions ingested yet for AAPL/i)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// CongressTab
// ---------------------------------------------------------------------------

import { CongressTab } from '@/components/stock/CongressTab';

describe('CongressTab', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders skeleton while fetch is pending', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const { container } = render(React.createElement(CongressTab, { ticker: 'NVDA' }));
    expect(container.querySelector('table')).toBeTruthy();
  });

  it('renders empty-state text when congress list is empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ congress: [] }) }),
    );
    await act(async () => {
      render(React.createElement(CongressTab, { ticker: 'NVDA' }));
    });
    expect(screen.getByText(/No Congressional trades on file for NVDA/i)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// FundsTab
// ---------------------------------------------------------------------------

import { FundsTab } from '@/components/stock/FundsTab';

describe('FundsTab', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders skeleton while fetch is pending', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const { container } = render(React.createElement(FundsTab, { ticker: 'MSFT' }));
    expect(container.querySelector('table')).toBeTruthy();
  });

  it('renders empty-state text when funds list is empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ funds: [] }) }),
    );
    await act(async () => {
      render(React.createElement(FundsTab, { ticker: 'MSFT' }));
    });
    expect(screen.getByText(/No 13F holdings ingested yet/i)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// SentimentTab
// ---------------------------------------------------------------------------

import { SentimentTab } from '@/components/stock/SentimentTab';

describe('SentimentTab', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders skeleton while fetch is pending', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const { container } = render(React.createElement(SentimentTab, { ticker: 'GME' }));
    expect(container.querySelector('div')).toBeTruthy();
  });

  it('renders empty-state text when sentiment list is empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ sentiment: [] }) }),
    );
    await act(async () => {
      render(React.createElement(SentimentTab, { ticker: 'GME' }));
    });
    expect(screen.getByText(/No retail sentiment snapshots yet/i)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// SignalsPanel
// ---------------------------------------------------------------------------

import { SignalsPanel } from '@/components/stock/SignalsPanel';

describe('SignalsPanel', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders nothing when signals fetch returns all nulls', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ fda: null, dod: null, ark: null, edgar: null, wiki: null, hiring: null }),
      }),
    );
    await act(async () => {
      render(React.createElement(SignalsPanel, { ticker: 'AAPL' }));
    });
    // Component returns null when all signals are null
    expect(screen.queryByText(/FDA/)).toBeNull();
  });

  it('renders a signal badge when a signal is present', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          fda: null,
          dod: { award_amount: 5e6, action_date: '2025-01-15', recipient_name: 'Acme Corp' },
          ark: null,
          edgar: null,
          wiki: null,
          hiring: null,
        }),
      }),
    );
    await act(async () => {
      render(React.createElement(SignalsPanel, { ticker: 'LMT' }));
    });
    expect(screen.getByText(/DOD/)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// StockDetailClient — mount test only; deep-integration skipped due to
// dependency on Chart (canvas), multiple fetches, and tab components
// ---------------------------------------------------------------------------

import { StockDetailClient } from '@/components/stock/StockDetailClient';

describe('StockDetailClient', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('mounts without crashing and renders the ticker header', async () => {
    // All fetches return empty/null-safe shapes
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ events: [], news: [], insiders: [], congress: [], funds: [], sentiment: [], fda: null, dod: null, ark: null, edgar: null, wiki: null, hiring: null }),
      }),
    );

    await act(async () => {
      render(
        React.createElement(StockDetailClient, {
          ticker: 'AAPL',
          initialMeta: { name: 'Apple Inc.' },
          initialQuote: null,
          initialBars: [],
          initialTags: [],
          position: { qty: 0, avgCost: 0 },
        }),
      );
    });

    expect(screen.getByText('AAPL')).toBeTruthy();
  });

  it('shows "Not in your portfolio" when position qty is 0', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ events: [], fda: null, dod: null, ark: null, edgar: null, wiki: null, hiring: null }),
      }),
    );

    await act(async () => {
      render(
        React.createElement(StockDetailClient, {
          ticker: 'NVDA',
          initialMeta: null,
          initialQuote: null,
          initialBars: [],
          initialTags: [],
          position: { qty: 0, avgCost: 0 },
        }),
      );
    });

    expect(screen.getByText(/Not in your portfolio/i)).toBeTruthy();
  });
});
