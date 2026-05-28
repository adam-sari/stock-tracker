'use client';

import { useEffect, useState } from 'react';
import type { BacktestHistoryRow } from '@/lib/db/queries/backtest-history';
import { composeFromHistory } from '@/lib/computations/composite-from-history';
import { DEFAULT_WEIGHTS } from '@/lib/computations/discovery';
import { BacktestHistoryTable } from './BacktestHistoryTable';
import { CompositeSparkline } from './CompositeSparkline';

function BacktestSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="animate-pulse bg-panel rounded h-5 w-48" />
      <div className="animate-pulse bg-panel rounded h-32 w-full" />
    </div>
  );
}

export function BacktestTab({ ticker }: { ticker: string }) {
  const [history, setHistory] = useState<BacktestHistoryRow[] | null>(null);

  useEffect(() => {
    fetch(`/api/stock/${ticker}/backtest-history`)
      .then(r => r.json())
      .then(d => setHistory(d.history ?? []))
      .catch(() => setHistory([]));
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
    </section>
  );
}
