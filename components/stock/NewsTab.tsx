'use client';

import { useEffect, useState } from 'react';
import { timeAgo } from '@/lib/time';

type NewsItem = { id: string; ticker: string; headline: string; url: string; source: string; published_at: number };

function NewsSkeleton() {
  return (
    <ul className="divide-y divide-border">
      {[1, 2, 3, 4].map(i => (
        <li key={i} className="py-3 space-y-2">
          <div className="animate-pulse bg-panel rounded h-4 w-3/4" />
          <div className="animate-pulse bg-panel rounded h-3 w-1/4" />
        </li>
      ))}
    </ul>
  );
}

export function NewsTab({ ticker }: { ticker: string }) {
  const [items, setItems] = useState<NewsItem[] | null>(null);

  useEffect(() => {
    fetch(`/api/stock/${ticker}/news`).then(r => r.json()).then(d => setItems(d.news ?? [])).catch(() => setItems([]));
  }, [ticker]);

  if (items === null) return <NewsSkeleton />;
  if (items.length === 0) return <div className="text-muted">No news fetched yet for {ticker}.</div>;

  return (
    <ul className="divide-y divide-border">
      {items.map(it => (
        <li key={it.id} className="py-3">
          <a href={it.url} target="_blank" rel="noopener noreferrer" className="block hover:bg-panel/40 -mx-2 px-2 py-1 rounded">
            <div className="font-medium text-accent">{it.headline}</div>
            <div className="text-xs text-muted mt-0.5">{it.source} · {timeAgo(it.published_at)}</div>
          </a>
        </li>
      ))}
    </ul>
  );
}
