'use client';

import { useEffect, useState } from 'react';
import type { BacktestHistoryPiRow } from '@/app/api/stock/[ticker]/backtest-history/route';
import { CompositeSparkline } from './CompositeSparkline';

function fmt(v: number | null | undefined): string {
  if (v == null) return '—';
  return (v * 100).toFixed(1) + '%';
}

function BacktestSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="animate-pulse bg-panel rounded h-5 w-48" />
      <div className="animate-pulse bg-panel rounded h-32 w-full" />
    </div>
  );
}

function BacktestHistoryTable({ rows }: { rows: BacktestHistoryPiRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted italic">No backtest scores yet.</p>
    );
  }
  return (
    <table className="text-sm w-full">
      <thead>
        <tr>
          <th className="text-left font-normal text-muted">Date</th>
          <th className="text-right font-normal text-muted">Score</th>
          <th className="text-right font-normal text-muted">Ret 21d</th>
          <th className="text-right font-normal text-muted">vs SPY</th>
          <th className="text-right font-normal text-muted">21d PI</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.date}>
            <td className="text-muted">{r.date}</td>
            <td className="text-right tabular-nums">{r.score.toFixed(2)}</td>
            <td className="text-right tabular-nums">{fmt(r.return_21d)}</td>
            <td className="text-right tabular-nums">{fmt(r.spy_excess_21d)}</td>
            <td className="text-right tabular-nums">
              {r.lower_21d != null && r.upper_21d != null
                ? `[${fmt(r.lower_21d)}, ${fmt(r.upper_21d)}]`
                : <span className="text-muted">—</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function BacktestTab({ ticker }: { ticker: string }) {
  const [rows, setRows] = useState<BacktestHistoryPiRow[] | null>(null);

  useEffect(() => {
    fetch(`/api/stock/${ticker}/backtest-history`)
      .then(r => r.json())
      .then(d => { setRows(d.rows ?? []); })
      .catch(() => { setRows([]); });
  }, [ticker]);

  if (rows === null) return <BacktestSkeleton />;

  const composite = rows
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(r => ({ date: r.date, compositeScore: r.score }));

  return (
    <section className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Backtest scores — last 90 days</h3>
        <div className="w-48 text-accent"><CompositeSparkline points={composite} /></div>
      </header>
      <BacktestHistoryTable rows={rows} />
    </section>
  );
}
