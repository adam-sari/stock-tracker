'use client';

import { useCallback, useEffect, useState } from 'react';
import { PortfolioValueChart, type ValuePoint } from '@/components/PortfolioValueChart';
import { HoldingsTable } from '@/components/HoldingsTable';
import { PortfolioSummary } from '@/components/PortfolioSummary';
import { AddHoldingDrawer } from '@/components/AddHoldingDrawer';
import { ProviderHealthBadge } from '@/components/ProviderHealthBadge';
import { DashboardActivityFeed } from '@/components/DashboardActivityFeed';
import { UpcomingEarnings } from '@/components/UpcomingEarnings';
import { WatchlistPanel } from '@/components/WatchlistPanel';
import { RunAllJobsButton } from '@/components/RunAllJobsButton';
import type { PortfolioValue } from '@/lib/computations/portfolio';

type Props = { initialValue: PortfolioValue; initialTags: Record<string, string[]> };

const RANGES = [
  { label: '1D', range: '1d' },
  { label: '5D', range: '5d' },
  { label: '1M', range: '1m' },
  { label: '3M', range: '3m' },
  { label: 'YTD', range: 'ytd' },
  { label: '1Y', range: '1y' },
  { label: 'ALL', range: 'all' },
];

export function DashboardClient({ initialValue, initialTags }: Props) {
  const [value, setValue] = useState<PortfolioValue>(initialValue);
  const [series, setSeries] = useState<ValuePoint[]>([]);
  const [rangeIdx, setRangeIdx] = useState(0);

  useEffect(() => {
    const r = RANGES[rangeIdx];
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch(`/api/portfolio/value-series?range=${r.range}`);
        if (!res.ok) { setSeries([]); return; }
        const data = await res.json();
        if (!cancelled && Array.isArray(data)) setSeries(data);
      } catch {
        if (!cancelled) setSeries([]);
      }
    };

    load();
    // Poll: 30s for short ranges (1m candles), 5min for daily
    const pollMs = (r.range === '1d' || r.range === '5d') ? 30_000 : 5 * 60_000;
    const id = setInterval(load, pollMs);
    return () => { cancelled = true; clearInterval(id); };
  }, [rangeIdx]);

  const refreshValue = useCallback(async () => {
    const r = await fetch('/api/portfolio/value');
    if (r.ok) setValue(await r.json());
  }, []);

  useEffect(() => {
    const id = setInterval(refreshValue, 30_000);
    return () => clearInterval(id);
  }, [refreshValue]);

  return (
    <main className="p-6 max-w-6xl mx-auto flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Stock Tracker</h1>
        <div className="flex items-center gap-4">
          <ProviderHealthBadge />
          <AddHoldingDrawer onCreated={refreshValue} />
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <PortfolioSummary value={value} />
        <UpcomingEarnings />
      </div>

      <section>
        <div className="flex items-center gap-3 mb-2">
          <h2 className="text-sm uppercase text-muted">Portfolio value</h2>
          <div className="flex gap-1 ml-auto">
            {RANGES.map((r, i) => (
              <button key={r.label} onClick={() => setRangeIdx(i)}
                className={`text-xs px-2 py-0.5 rounded border ${i === rangeIdx ? 'bg-accent text-bg border-accent' : 'border-border text-muted hover:text-text'}`}>
                {r.label}
              </button>
            ))}
          </div>
        </div>
        <PortfolioValueChart series={series} height={360} />
      </section>

      <section>
        <h2 className="text-sm uppercase text-muted mb-2">Holdings</h2>
        <HoldingsTable rows={value.rows} tagsByTicker={initialTags} />
      </section>

      <WatchlistPanel />

      <section>
        <h2 className="text-sm uppercase text-muted mb-2">Activity on your holdings</h2>
        <DashboardActivityFeed />
      </section>

      <footer className="flex items-center justify-end border-t border-border pt-4 mt-2">
        <RunAllJobsButton />
      </footer>
    </main>
  );
}
