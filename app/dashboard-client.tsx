'use client';

import { useCallback, useEffect, useState } from 'react';
import { Chart } from '@/components/Chart';
import { HoldingsTable } from '@/components/HoldingsTable';
import { PortfolioSummary } from '@/components/PortfolioSummary';
import { AddHoldingDrawer } from '@/components/AddHoldingDrawer';
import { ProviderHealthBadge } from '@/components/ProviderHealthBadge';
import { DashboardActivityFeed } from '@/components/DashboardActivityFeed';
import type { PortfolioValue } from '@/lib/computations/portfolio';
import type { Bar } from '@/lib/providers/types';

type Props = { initialValue: PortfolioValue; initialTags: Record<string, string[]> };

const RANGES = [
  { label: '1D', range: '1d', interval: '1m' as const },
  { label: '5D', range: '5d', interval: '1m' as const },
  { label: '1M', range: '1mo', interval: '1d' as const },
  { label: '3M', range: '3mo', interval: '1d' as const },
  { label: 'YTD', range: 'ytd', interval: '1d' as const },
  { label: '1Y', range: '1y', interval: '1d' as const },
  { label: 'ALL', range: 'max', interval: '1d' as const },
];

export function DashboardClient({ initialValue, initialTags }: Props) {
  const [value, setValue] = useState<PortfolioValue>(initialValue);
  const [bars, setBars] = useState<Bar[]>([]);
  const [rangeIdx, setRangeIdx] = useState(0);
  const [primaryTicker, setPrimaryTicker] = useState<string | null>(null);

  useEffect(() => {
    const top = [...value.rows].sort((a, b) => b.market_value - a.market_value)[0];
    setPrimaryTicker(top?.ticker ?? null);
  }, [value]);

  useEffect(() => {
    if (!primaryTicker) { setBars([]); return; }
    const r = RANGES[rangeIdx];
    let cancelled = false;

    const load = async () => {
      const controller = new AbortController();
      try {
        const res = await fetch(`/api/prices/${primaryTicker}/bars?interval=${r.interval}&range=${r.range}&prepost=true`, {
          signal: controller.signal,
        });
        const data = await res.json();
        if (!cancelled && Array.isArray(data)) setBars(data);
      } catch (e) {
        if (!cancelled && (e as Error).name !== 'AbortError') setBars([]);
      }
      return () => controller.abort();
    };

    load();
    // Poll live: 30s for minute charts, 5min for daily charts
    const pollMs = r.interval === '1m' ? 30_000 : 5 * 60_000;
    const id = setInterval(load, pollMs);
    return () => { cancelled = true; clearInterval(id); };
  }, [primaryTicker, rangeIdx]);

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

      <PortfolioSummary value={value} />

      <section>
        <div className="flex items-center gap-3 mb-2">
          <h2 className="text-sm uppercase text-muted">
            Chart: {primaryTicker ?? '(add a holding first)'}
          </h2>
          <div className="flex gap-1 ml-auto">
            {RANGES.map((r, i) => (
              <button key={r.label} onClick={() => setRangeIdx(i)}
                className={`text-xs px-2 py-0.5 rounded border ${i === rangeIdx ? 'bg-accent text-bg border-accent' : 'border-border text-muted hover:text-text'}`}>
                {r.label}
              </button>
            ))}
          </div>
        </div>
        <Chart bars={bars} height={360} showSessions={RANGES[rangeIdx].interval === '1m'} />
      </section>

      <section>
        <h2 className="text-sm uppercase text-muted mb-2">Holdings</h2>
        <HoldingsTable rows={value.rows} tagsByTicker={initialTags} />
      </section>

      <section>
        <h2 className="text-sm uppercase text-muted mb-2">Activity on your holdings</h2>
        <DashboardActivityFeed />
      </section>
    </main>
  );
}
