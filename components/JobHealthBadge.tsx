'use client';

import { useEffect, useState } from 'react';

type JobRow = {
  job: string;
  started_at: number;
  status: string;
  detail: string | null;
  finished_at: number | null;
};

function formatAgo(ts: number | null): string {
  if (!ts) return 'never';
  const diffMs = Date.now() - ts * 1000;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

export function JobHealthBadge() {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const load = () =>
      fetch('/api/admin/job-status')
        .then(r => r.json())
        .then(d => setJobs(Array.isArray(d.jobs) ? d.jobs : []))
        .catch(() => {});
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  if (jobs.length === 0) return null;

  const errorJobs = jobs.filter(j => j.status === 'error');
  const mostRecent = jobs.reduce<JobRow | null>((best, j) => {
    if (!best || j.started_at > best.started_at) return j;
    return best;
  }, null);

  const summaryColor = errorJobs.length > 0 ? 'text-down' : 'text-up';

  return (
    <div className="text-xs text-muted">
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-1.5 hover:text-text transition-colors"
        aria-expanded={expanded}
      >
        <span className={`inline-block w-1.5 h-1.5 rounded-full ${errorJobs.length > 0 ? 'bg-down' : 'bg-up'}`} />
        <span className={summaryColor}>
          {jobs.length} jobs · last run: {formatAgo(mostRecent?.started_at ?? null)}
          {errorJobs.length > 0 && ` · ${errorJobs.length} error${errorJobs.length === 1 ? '' : 's'}`}
        </span>
        <span className="text-muted/60">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="mt-2 rounded border border-border bg-panel p-3 max-h-64 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="text-muted uppercase">
              <tr>
                <th className="text-left pb-1">Job</th>
                <th className="text-left pb-1">Status</th>
                <th className="text-left pb-1">Last run</th>
                <th className="text-left pb-1">Detail</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map(j => (
                <tr key={j.job} className="border-t border-border/50">
                  <td className="py-1 pr-3 font-mono">{j.job}</td>
                  <td className={`py-1 pr-3 ${j.status === 'ok' ? 'text-up' : j.status === 'error' ? 'text-down' : 'text-yellow-400'}`}>
                    {j.status}
                  </td>
                  <td className="py-1 pr-3 text-muted">{formatAgo(j.started_at)}</td>
                  <td className="py-1 text-muted truncate max-w-[200px]" title={j.detail ?? undefined}>
                    {j.detail ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
