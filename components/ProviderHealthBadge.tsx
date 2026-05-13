'use client';

import { useEffect, useState } from 'react';

type Row = {
  provider: string;
  status: 'ok' | 'degraded' | 'down' | 'unknown';
  last_success: number | null;
};

export function ProviderHealthBadge() {
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    const load = () =>
      fetch('/api/health').then(r => r.json()).then(d => setRows(d.providers ?? [])).catch(() => {});
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  if (rows.length === 0) return null;

  return (
    <div className="text-xs text-muted flex gap-2">
      {rows.map(r => (
        <span key={r.provider} className="flex items-center gap-1">
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${
            r.status === 'ok' ? 'bg-up' :
            r.status === 'degraded' ? 'bg-yellow-400' :
            'bg-down'
          }`} />
          {r.provider}
        </span>
      ))}
    </div>
  );
}
