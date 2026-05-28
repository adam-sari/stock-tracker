'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type WatchRow = {
  ticker: string;
  added_at: number;
  source: 'manual' | 'discovery';
  note: string | null;
};

type Quote = { ticker: string; price: number };

export function WatchlistPanel() {
  const [items, setItems] = useState<WatchRow[] | null>(null);
  const [quotes, setQuotes] = useState<Record<string, number>>({});

  const refresh = async () => {
    try {
      const r = await fetch('/api/watchlist');
      const d = await r.json();
      setItems(d.watchlist ?? []);
    } catch {
      setItems([]);
    }
  };

  useEffect(() => { refresh(); }, []);

  useEffect(() => {
    if (!items || items.length === 0) return;
    let cancelled = false;
    const fetchQuotes = async () => {
      const next: Record<string, number> = {};
      await Promise.all(items.map(async w => {
        try {
          const r = await fetch(`/api/prices/${w.ticker}/latest`);
          if (r.ok) {
            const q = await r.json() as Quote;
            next[w.ticker] = q.price;
          }
        } catch { /* skip */ }
      }));
      if (!cancelled) setQuotes(next);
    };
    fetchQuotes();
    const id = setInterval(fetchQuotes, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [items]);

  const remove = async (ticker: string) => {
    await fetch(`/api/watchlist/${ticker}`, { method: 'DELETE' });
    setItems(prev => (prev ?? []).filter(w => w.ticker !== ticker));
  };

  if (items === null) return null;
  if (items.length === 0) return null;

  return (
    <section>
      <div className="flex items-baseline gap-3 mb-2">
        <h2 className="text-sm uppercase text-muted">Watchlist</h2>
        <Link href="/watchlist/sim" className="text-xs text-muted hover:underline">View PnL sim ↗</Link>
      </div>
      <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[400px]">
        <thead className="text-muted uppercase text-xs">
          <tr><th className="text-left py-2">Ticker</th><th className="text-right">Price</th><th className="text-left">Source</th><th></th></tr>
        </thead>
        <tbody>
          {items.map(w => (
            <tr key={w.ticker} className="border-t border-border hover:bg-panel/40">
              <td className="py-2">
                <Link href={`/stock/${w.ticker}`} className="text-accent hover:underline">{w.ticker}</Link>
                {w.note && <span className="ml-2 text-xs text-muted">{w.note}</span>}
              </td>
              <td className="text-right tabular-nums">{quotes[w.ticker] ? `$${quotes[w.ticker].toFixed(2)}` : '—'}</td>
              <td className="text-xs text-muted">{w.source === 'discovery' ? 'from Discovery' : 'manual'}</td>
              <td className="text-right">
                <button onClick={() => remove(w.ticker)} className="text-xs text-muted hover:text-down">remove</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </section>
  );
}
