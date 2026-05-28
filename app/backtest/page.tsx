import Link from 'next/link';
import { applySchema } from '@/lib/db/migrate';
import { getDb } from '@/lib/db/connection';
import { loadLatestSummary } from '@/lib/backtest/summary-reader';
import {
  topByCompositeScore,
  topByMostSignals,
  topByAcceleration,
} from '@/lib/backtest/top-n-queries';
import { HeadlineCard } from '@/components/backtest/HeadlineCard';
import { PerSignalGrid } from '@/components/backtest/PerSignalGrid';
import { LiveMonitor } from '@/components/backtest/LiveMonitor';
import { EmptyState } from '@/components/backtest/EmptyState';

applySchema();

export const dynamic = 'force-dynamic';

export default async function BacktestPage() {
  const summary = await loadLatestSummary();
  const db = getDb();
  const highest = topByCompositeScore(db, 7, 20);
  const mostSignals = topByMostSignals(db, 7, 20);
  const accelerating = topByAcceleration(db, 7, 20);

  return (
    <main className="p-6 max-w-5xl mx-auto flex flex-col gap-5">
      <header className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Backtest</h1>
          {summary ? (
            <p className="text-sm text-muted mt-1">
              Window: {summary.run.from_date} → {summary.run.to_date} ·{' '}
              sha <code>{summary.run.scoring_git_sha}</code> ·{' '}
              {summary.run.n_assets} assets · {summary.run.n_dates} dates
            </p>
          ) : (
            <p className="text-sm text-muted mt-1">No backtest run on disk yet.</p>
          )}
        </div>
        <div className="flex gap-4 items-center">
          <Link href="/discover" className="text-sm hover:underline">/discover ↗</Link>
          <Link href="/backtest/predictions" className="text-sm hover:underline">Predictions log ↗</Link>
          <a
            href="/api/backtest/report"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm rounded border border-default px-3 py-1 hover:bg-white/5"
          >
            Open full HTML report ↗
          </a>
        </div>
      </header>

      {summary ? (
        <>
          <HeadlineCard horizons={summary.horizons} composite_ic={summary.composite_ic} />
          <PerSignalGrid horizons={summary.horizons} perSignal={summary.per_signal} />
        </>
      ) : (
        <EmptyState />
      )}

      <LiveMonitor highest={highest} mostSignals={mostSignals} accelerating={accelerating} />

      <footer className="text-xs text-muted">
        Re-run via:&nbsp;
        <code>uv run python -m sidecar.backtest --from &lt;d&gt; --to &lt;d&gt;</code>
      </footer>
    </main>
  );
}
