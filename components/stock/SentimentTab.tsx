'use client';

import { useEffect, useState } from 'react';
import { timeAgo } from '@/lib/time';

type SentimentSnapshot = {
  ticker: string;
  ts: number;
  source: string;
  rank: number | null;
  mentions: number;
  upvotes: number | null;
  mentions_24h_ago: number | null;
};

export function SentimentTab({ ticker }: { ticker: string }) {
  const [items, setItems] = useState<SentimentSnapshot[] | null>(null);

  useEffect(() => {
    fetch(`/api/stock/${ticker}/sentiment`).then(r => r.json()).then(d => setItems(d.sentiment ?? [])).catch(() => setItems([]));
  }, [ticker]);

  if (items === null) return <div className="text-muted">Loading…</div>;
  if (items.length === 0) return <div className="text-muted">No retail sentiment snapshots yet. Apewisdom is polled every 30 min and only stores tickers in your holdings + watchlist.</div>;

  const latest = items[0];
  const surge = latest.mentions_24h_ago && latest.mentions_24h_ago > 0
    ? (latest.mentions / latest.mentions_24h_ago - 1) * 100
    : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <Stat label="Rank" value={latest.rank !== null ? `#${latest.rank}` : '—'} />
        <Stat label="Mentions (24h)" value={latest.mentions.toLocaleString()} />
        <Stat label="Upvotes" value={latest.upvotes !== null ? latest.upvotes.toLocaleString() : '—'} />
        <Stat label="24h change" value={surge !== null ? `${surge >= 0 ? '+' : ''}${surge.toFixed(1)}%` : '—'} valueClass={surge !== null ? (surge >= 0 ? 'text-up' : 'text-down') : ''} />
      </div>
      <div>
        <h3 className="text-xs uppercase text-muted mb-2">History ({items.length} snapshots)</h3>
        <ul className="space-y-1 text-sm">
          {items.slice(0, 30).map(s => (
            <li key={s.ts} className="flex justify-between border-b border-border/50 pb-1">
              <span className="text-muted">{timeAgo(s.ts)}</span>
              <span>rank #{s.rank ?? '?'} · {s.mentions} mentions</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Stat({ label, value, valueClass = '' }: { label: string; value: React.ReactNode; valueClass?: string }) {
  return (
    <div>
      <div className="text-xs uppercase text-muted">{label}</div>
      <div className={`tabular-nums ${valueClass}`}>{value}</div>
    </div>
  );
}
