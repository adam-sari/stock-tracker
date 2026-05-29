import Link from 'next/link';
import { applySchema } from '@/lib/db/migrate';
import { getDb } from '@/lib/db/connection';
import { listPredictionsWithPI, computeHitRate } from '@/lib/backtest/predictions-queries';
import { PredictionsTable } from '@/components/backtest/PredictionsTable';
import { HitRateCard } from '@/components/backtest/HitRateCard';

applySchema();

export const dynamic = 'force-dynamic';

export default async function PredictionsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; min?: string }>;
}) {
  const sp = await searchParams;
  const signalKind = sp.kind;
  const minScore = sp.min ? Number(sp.min) : 0.5;
  const db = getDb();
  const rows = listPredictionsWithPI(db, { signalKind, minScore, limit: 200 });
  const hitRates = [1, 5, 21, 63].map(h => ({
    h,
    ...computeHitRate(db, { horizon: h, minScore, signalKind }),
  }));

  const piRows = rows.filter(r => r.in_pi_21d !== null);
  const piHits = piRows.filter(r => r.in_pi_21d === true).length;
  const piCoverage = piRows.length > 0 ? piHits / piRows.length : null;

  return (
    <main className="p-6 max-w-6xl mx-auto flex flex-col gap-5">
      <header className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Predictions log</h1>
          <p className="text-sm text-muted mt-1">
            Historical backtest scores with realized forward returns. Hit = SPY-excess &gt; 0.
            {signalKind ? ` · kind=${signalKind}` : ''}
            {' · '}
            min score {minScore.toFixed(2)}
          </p>
        </div>
        <Link href="/backtest" className="text-sm hover:underline">← Backtest</Link>
      </header>
      <section className="flex gap-3 flex-wrap">
        {hitRates.map(hr => (
          <HitRateCard
            key={hr.h}
            horizon={hr.h}
            hitRate={hr.hitRate}
            n={hr.n}
            meanSpyExcess={hr.meanSpyExcess}
          />
        ))}
      </section>
      {piCoverage !== null && (
        <p className="text-sm text-muted">
          Empirical 21d coverage:{' '}
          <span className="font-medium text-foreground">
            {(piCoverage * 100).toFixed(1)}%
          </span>{' '}
          (n={piRows.length})
        </p>
      )}
      <section>
        {rows.length === 0 ? (
          <p className="text-sm text-muted italic">
            No predictions yet. Generate scores via the backtest pipeline, then run{' '}
            <code>npm run compute-returns</code>.
          </p>
        ) : (
          <PredictionsTable rows={rows} />
        )}
      </section>
    </main>
  );
}
