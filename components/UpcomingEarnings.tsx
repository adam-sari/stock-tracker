'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type Row = {
  ticker: string;
  earnings_date: string;
  hour: string | null;
  eps_estimate: number | null;
  num_estimates: number | null;
};

const HOUR_LABEL: Record<string, string> = {
  bmo: 'Before open',
  amc: 'After close',
  dmh: 'During hours',
};

function daysUntil(dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00Z').getTime();
  const now = Date.now();
  return Math.ceil((d - now) / 86400_000);
}

export function UpcomingEarnings() {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    fetch('/api/portfolio/earnings?days=60')
      .then(r => r.json())
      .then(d => setRows(d.earnings ?? []))
      .catch(() => setRows([]));
  }, []);

  if (rows === null) return null;
  if (rows.length === 0) return null;

  return (
    <div className="rounded border border-border p-3">
      <div className="text-xs uppercase text-muted mb-2">Upcoming earnings (next 60 days)</div>
      <ul className="text-sm space-y-1">
        {rows.map(r => {
          const d = daysUntil(r.earnings_date);
          const dLabel = d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d}d`;
          return (
            <li key={`${r.ticker}-${r.earnings_date}`} className="flex justify-between items-baseline">
              <span>
                <Link href={`/stock/${r.ticker}`} className="text-accent hover:underline font-medium">{r.ticker}</Link>
                <span className="text-xs text-muted ml-2">{r.earnings_date}</span>
                {r.hour && HOUR_LABEL[r.hour] && <span className="text-xs text-muted ml-1">· {HOUR_LABEL[r.hour]}</span>}
              </span>
              <span className="text-xs text-muted tabular-nums">
                {r.eps_estimate !== null && `EPS est ${r.eps_estimate.toFixed(2)}`}
                <span className="ml-2">{dLabel}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
