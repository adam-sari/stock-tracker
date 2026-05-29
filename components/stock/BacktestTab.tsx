'use client';

import { useEffect, useState } from 'react';
import type { BacktestHistoryRow } from '@/lib/db/queries/backtest-history';
import type { BacktestHistoryPiRow } from '@/app/api/stock/[ticker]/backtest-history/route';
import { composeFromHistory } from '@/lib/computations/composite-from-history';
import { DEFAULT_WEIGHTS } from '@/lib/computations/discovery';
import { BacktestHistoryTable } from './BacktestHistoryTable';
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

function BacktestPiTable({ rows }: { rows: BacktestHistoryPiRow[] }) {
  if (rows.length === 0) return null;
  return (
    <table className="text-sm w-full mt-2">
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
  const [history, setHistory] = useState<BacktestHistoryRow[] | null>(null);
  const [piRows, setPiRows] = useState<BacktestHistoryPiRow[]>([]);

  useEffect(() => {
    fetch(`/api/stock/${ticker}/backtest-history`)
      .then(r => r.json())
      .then(d => {
        setHistory(d.history ?? []);
        setPiRows(d.rows ?? []);
      })
      .catch(() => { setHistory([]); setPiRows([]); });
  }, [ticker]);

  if (history === null) return <BacktestSkeleton />;

  const composite = composeFromHistory(history, DEFAULT_WEIGHTS);
  const inUniverse = true;

  return (
    <section className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Backtest scores — last 90 days</h3>
        <div className="w-48 text-accent"><CompositeSparkline points={composite} /></div>
      </header>
      <BacktestHistoryTable rows={history} ticker={ticker} inUniverse={inUniverse} />
      <BacktestPiTable rows={piRows} />
    </section>
  );
}
