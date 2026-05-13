'use client';

import { useEffect, useMemo, useState } from 'react';
import { SignalFilters, ALL_SIGNALS } from './SignalFilters';
import { DiscoveryCard } from './DiscoveryCard';

type Signal = { kind: 'insider' | 'congress' | 'funds' | 'halts'; score: number; weight: number; detail: string };
type Item = { ticker: string; score: number; signals: Signal[]; computed_at: number };

export function DiscoveryClient({ initial }: { initial: Item[] }) {
  const [items, setItems] = useState<Item[]>(initial);
  const [enabled, setEnabled] = useState<Set<string>>(new Set(ALL_SIGNALS));

  useEffect(() => {
    const signalsParam = Array.from(enabled).join(',');
    const url = signalsParam ? `/api/discover?signals=${signalsParam}` : '/api/discover';
    const controller = new AbortController();
    fetch(url, { signal: controller.signal })
      .then(r => r.json())
      .then(d => { if (d?.items) setItems(d.items); })
      .catch(e => { if (e.name !== 'AbortError') setItems([]); });
    return () => controller.abort();
  }, [enabled]);

  const toggle = (id: string) => {
    setEnabled(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const computedAt = useMemo(() => items[0]?.computed_at ?? null, [items]);

  return (
    <main className="p-6 max-w-5xl mx-auto flex flex-col gap-5">
      <header className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Discover</h1>
          <p className="text-sm text-muted mt-1">Tickers not in your portfolio, surfaced by active signals.</p>
        </div>
        {computedAt && (
          <span className="text-xs text-muted">Last scored: {new Date(computedAt * 1000).toLocaleString()}</span>
        )}
      </header>

      <SignalFilters enabled={enabled} onToggle={toggle} />

      {items.length === 0 ? (
        <div className="rounded border border-border p-6 text-muted">
          No discovery candidates yet. The job runs daily at 06:00 UTC — or you can wait for it to populate after the ingestion jobs catch up.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {items.map(it => <DiscoveryCard key={it.ticker} item={it} onWatch={() => {}} />)}
        </div>
      )}
    </main>
  );
}
