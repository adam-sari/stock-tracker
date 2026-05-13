'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { timeAgo } from '@/lib/time';

type ActivityEvent = {
  ts: number;
  kind: 'news' | 'insider' | 'congress' | 'fund' | 'sentiment' | 'halt' | 'fda' | 'dod' | 'ark' | 'edgar_alert';
  ticker: string;
  title: string;
  detail: string;
  link?: string | null;
  source: string;
};

const ICONS: Record<ActivityEvent['kind'], string> = {
  news: '📰', insider: '⬆', congress: '🏛', fund: '💼', sentiment: '💬', halt: '⛔',
  fda: '💊', dod: '🛡', ark: '🚀', edgar_alert: '⚠️',
};

const KIND_COLOR: Record<ActivityEvent['kind'], string> = {
  news: 'text-slate-300',
  insider: 'text-emerald-300',
  congress: 'text-purple-300',
  fund: 'text-amber-300',
  sentiment: 'text-blue-300',
  halt: 'text-red-300',
  fda: 'text-cyan-300',
  dod: 'text-blue-300',
  ark: 'text-fuchsia-300',
  edgar_alert: 'text-orange-300',
};

export function DashboardActivityFeed() {
  const [events, setEvents] = useState<ActivityEvent[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch('/api/portfolio/activity?limit=20');
        const d = await r.json();
        if (!cancelled) setEvents(d.events ?? []);
      } catch {
        if (!cancelled) setEvents([]);
      }
    };
    load();
    const id = setInterval(load, 5 * 60_000); // refresh every 5 min
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  if (events === null) return <div className="text-muted text-sm">Loading activity…</div>;
  if (events.length === 0) {
    return (
      <div className="text-muted text-sm">
        No activity on your holdings yet. Ingestion jobs run on cadence — news hourly, sentiment every 30m, Congress every 4h, insiders/funds daily/weekly.
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {events.map((e, i) => (
        <li key={`${e.kind}-${e.ts}-${e.ticker}-${i}`} className="flex gap-2 items-start text-sm">
          <span className={`shrink-0 ${KIND_COLOR[e.kind]}`}>{ICONS[e.kind]}</span>
          <div className="flex-1 min-w-0">
            <span className="text-muted">
              <Link href={`/stock/${e.ticker}`} className="text-accent hover:underline font-medium">{e.ticker}</Link>
              {' · '}
            </span>
            <span>{e.title}</span>
            <span className="text-muted"> — {e.detail}</span>
            <span className="text-xs text-muted ml-2">{timeAgo(e.ts)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
