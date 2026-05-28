import Link from 'next/link';
import { applySchema } from '@/lib/db/migrate';
import { getDb } from '@/lib/db/connection';
import { simulateWatchlistPnL } from '@/lib/watchlist/sim-pnl';
import { SimPnLTable } from '@/components/watchlist/SimPnLTable';
import { SimPnLSummary } from '@/components/watchlist/SimPnLSummary';

applySchema();
export const dynamic = 'force-dynamic';

export default async function WatchlistSimPage() {
  const result = simulateWatchlistPnL(getDb());

  return (
    <main className="p-6 max-w-5xl mx-auto flex flex-col gap-5">
      <header className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Watchlist PnL simulation</h1>
          <p className="text-sm text-muted mt-1">
            Hypothetical PnL assuming entry at the first close on/after each ticker&apos;s <code>added_at</code> date,
            exit at the latest close (or the delisting close, if delisted). SPY-excess = ticker return − SPY return
            over the same window. Returns are split-adjusted via <code>corporate_actions</code>; dividends are NOT
            yet adjusted.
          </p>
        </div>
        <Link href="/" className="text-sm hover:underline">← Home</Link>
      </header>

      {result.spyMissing ? (
        <section className="rounded border border-default p-4">
          <p className="text-sm">
            SPY benchmark data not available — backfill SPY candles before the sim can compute excess returns.
          </p>
        </section>
      ) : (
        <>
          <SimPnLSummary aggregate={result.aggregate} asOfDate={result.asOfDate} />
          <SimPnLTable rows={result.rows} />
          {result.skipped.length > 0 && (
            <details className="text-xs text-muted">
              <summary>Skipped ({result.skipped.length})</summary>
              <ul className="mt-2 ml-4 list-disc">
                {result.skipped.map(s => (
                  <li key={s.ticker}><span className="font-mono">{s.ticker}</span> — {s.reason}</li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </main>
  );
}
