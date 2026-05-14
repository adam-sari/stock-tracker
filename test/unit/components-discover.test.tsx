/**
 * Minimal mount + empty-state tests for discovery UI components.
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

// ---------------------------------------------------------------------------
// SignalFilters
// ---------------------------------------------------------------------------

import { SignalFilters } from '@/components/discover/SignalFilters';

describe('SignalFilters', () => {
  afterEach(() => cleanup());

  it('renders all four signal filter buttons', () => {
    const enabled = new Set(['insider', 'congress', 'funds', 'halts']);
    render(React.createElement(SignalFilters, { enabled, onToggle: vi.fn() }));
    expect(screen.getByText(/Insider clusters/i)).toBeTruthy();
    expect(screen.getByText(/Congress buying/i)).toBeTruthy();
    expect(screen.getByText(/13F accumulation/i)).toBeTruthy();
    expect(screen.getByText(/Trading halts/i)).toBeTruthy();
  });

  it('renders with an empty enabled set without crashing', () => {
    render(React.createElement(SignalFilters, { enabled: new Set<string>(), onToggle: vi.fn() }));
    expect(screen.getByText(/Insider clusters/i)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// DiscoveryCard
// ---------------------------------------------------------------------------

import { DiscoveryCard } from '@/components/discover/DiscoveryCard';

const sampleItem = {
  ticker: 'NVDA',
  score: 0.85,
  computed_at: Math.floor(Date.now() / 1000),
  signals: [
    { kind: 'insider' as const, score: 0.9, weight: 1, detail: 'Large cluster buy' },
  ],
};

describe('DiscoveryCard', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the ticker and score', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(React.createElement(DiscoveryCard, { item: sampleItem, onWatch: vi.fn() }));
    expect(screen.getByText('NVDA')).toBeTruthy();
    expect(screen.getByText(/score/i)).toBeTruthy();
  });

  it('renders signal detail text', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(React.createElement(DiscoveryCard, { item: sampleItem, onWatch: vi.fn() }));
    expect(screen.getByText('Large cluster buy')).toBeTruthy();
  });

  it('renders the watchlist button in initial state', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(React.createElement(DiscoveryCard, { item: sampleItem, onWatch: vi.fn() }));
    expect(screen.getByText(/\+ watchlist/i)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// DiscoveryClient
// ---------------------------------------------------------------------------

import { DiscoveryClient } from '@/components/discover/DiscoveryClient';

describe('DiscoveryClient', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the Discover heading with empty initial data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ items: [] }),
      }),
    );
    await act(async () => {
      render(React.createElement(DiscoveryClient, { initial: [] }));
    });
    expect(screen.getByText('Discover')).toBeTruthy();
  });

  it('renders empty-state message when no items are available', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ items: [] }),
      }),
    );
    await act(async () => {
      render(React.createElement(DiscoveryClient, { initial: [] }));
    });
    expect(screen.getByText(/No discovery candidates yet/i)).toBeTruthy();
  });

  it('renders a discovery card when fetch returns items', async () => {
    const items = [
      {
        ticker: 'TSLA',
        score: 0.7,
        computed_at: Math.floor(Date.now() / 1000),
        signals: [{ kind: 'congress' as const, score: 0.7, weight: 1, detail: 'Senate purchase' }],
      },
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ items }),
      }),
    );
    await act(async () => {
      render(React.createElement(DiscoveryClient, { initial: [] }));
    });
    expect(screen.getByText('TSLA')).toBeTruthy();
  });
});
