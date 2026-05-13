'use client';

import { useEffect, useState } from 'react';
import { timeAgo } from '@/lib/time';

type ActivityEvent = {
  ts: number;
  kind: 'news' | 'insider' | 'congress' | 'fund' | 'sentiment' | 'halt';
  ticker: string;
  title: string;
  detail: string;
  link?: string | null;
  source: string;
};

const ICONS: Record<ActivityEvent['kind'], string> = {
  news: '📰', insider: '⬆', congress: '🏛', fund: '💼', sentiment: '💬', halt: '⛔',
};

const KIND_COLORS: Record<ActivityEvent['kind'], string> = {
  news: 'bg-slate-500/10 text-slate-300',
  insider: 'bg-emerald-500/10 text-emerald-300',
  congress: 'bg-purple-500/10 text-purple-300',
  fund: 'bg-amber-500/10 text-amber-300',
  sentiment: 'bg-blue-500/10 text-blue-300',
  halt: 'bg-red-500/10 text-red-300',
};

function ActivitySkeleton() {
  return (
    <ul className="space-y-3">
      {[1, 2, 3, 4].map(i => (
        <li key={i} className="flex gap-3 items-start">
          <div className="animate-pulse bg-panel rounded-full w-8 h-8 shrink-0" />
          <div className="flex-1 space-y-2 py-1">
            <div className="animate-pulse bg-panel rounded h-4 w-2/3" />
            <div className="animate-pulse bg-panel rounded h-3 w-1/2" />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ActivityTab({ ticker }: { ticker: string }) {
  const [events, setEvents] = useState<ActivityEvent[] | null>(null);

  useEffect(() => {
    fetch(`/api/stock/${ticker}/activity`)
      .then(r => r.json())
      .then(d => setEvents(d.events ?? []))
      .catch(() => setEvents([]));
  }, [ticker]);

  if (events === null) return <ActivitySkeleton />;
  if (events.length === 0) return <div className="text-muted">No activity yet. Background jobs ingest data on a cadence — check back later.</div>;

  return (
    <ul className="space-y-3">
      {events.map((e, i) => (
        <li key={`${e.kind}-${e.ts}-${i}`} className="flex gap-3 items-start">
          <span className={`shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full text-sm ${KIND_COLORS[e.kind]}`}>{ICONS[e.kind]}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="font-medium">{e.title}</span>
              <span className="text-xs text-muted">{timeAgo(e.ts)} · {e.source}</span>
            </div>
            <div className="text-sm text-muted truncate">{e.detail}</div>
            {e.link && <a href={e.link} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:underline">open</a>}
          </div>
        </li>
      ))}
    </ul>
  );
}
