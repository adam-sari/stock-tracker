'use client';

import Link from 'next/link';
import { useState } from 'react';

type Signal = { kind: 'insider' | 'congress' | 'funds' | 'halts'; score: number; weight: number; detail: string };
type Item = { ticker: string; score: number; signals: Signal[]; computed_at: number };

const ICONS: Record<Signal['kind'], string> = { insider: '⬆', congress: '🏛', funds: '💼', halts: '⛔' };
const KIND_COLOR: Record<Signal['kind'], string> = {
  insider: 'text-emerald-300',
  congress: 'text-purple-300',
  funds: 'text-amber-300',
  halts: 'text-red-300',
};

export function DiscoveryCard({ item, onWatch }: { item: Item; onWatch: (ticker: string) => void }) {
  const [watched, setWatched] = useState(false);
  const handleWatch = async () => {
    if (watched) return;
    await fetch('/api/watchlist', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ticker: item.ticker, source: 'discovery' }),
    });
    setWatched(true);
    onWatch(item.ticker);
  };

  return (
    <div className="border border-border rounded p-4 hover:bg-panel/30 transition-colors">
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <Link href={`/stock/${item.ticker}`} className="text-lg font-semibold text-accent hover:underline">{item.ticker}</Link>
        <div className="text-xs text-muted tabular-nums">score {(item.score * 100).toFixed(0)}</div>
      </div>
      <ul className="space-y-1 text-sm">
        {item.signals.map((s, i) => (
          <li key={i} className={`flex gap-2 ${KIND_COLOR[s.kind]}`}>
            <span>{ICONS[s.kind]}</span>
            <span>{s.detail}</span>
          </li>
        ))}
      </ul>
      <div className="flex gap-2 mt-3 text-xs">
        <Link href={`/stock/${item.ticker}`} className="px-2 py-1 rounded border border-border hover:bg-panel/50">view</Link>
        <button
          onClick={handleWatch}
          disabled={watched}
          className="px-2 py-1 rounded border border-accent/40 text-accent hover:bg-accent/10 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {watched ? '✓ on watchlist' : '+ watchlist'}
        </button>
      </div>
    </div>
  );
}
