import Link from 'next/link';
import { applySchema } from '@/lib/db/migrate';
import { getDb } from '@/lib/db/connection';
import { pivotScores, avgCrossSectionalCorrMatrix } from '@/lib/backtest/correlations';
import { CorrelationMatrix } from '@/components/backtest/CorrelationMatrix';

applySchema();
export const dynamic = 'force-dynamic';

// TODO(m8): expose `days` via search param when users ask for "did correlations change in 2026 vs 2024?"
const LOOKBACK_DAYS = 365;
const N_DATES_THRESHOLD = 30;  // Cells with fewer dates than this are greyed (M3)

export default async function CorrelationsPage() {
  const wide = pivotScores(getDb(), LOOKBACK_DAYS);
  // Spearman leads (M4): rank-based, robust to the [0,1] score-saturation pathology in discovery.ts.
  const spear = avgCrossSectionalCorrMatrix(wide, 'spearman');
  const pear  = avgCrossSectionalCorrMatrix(wide, 'pearson');
  const datesCount = new Set(wide.map(r => r.date)).size;
  return (
    <main className="p-6 max-w-5xl mx-auto flex flex-col gap-5">
      <header className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Signal correlations</h1>
          <p className="text-sm text-muted mt-1">
            Mean cross-sectional rank correlation across {datesCount.toLocaleString()} trading days
            ({wide.length.toLocaleString()} (date, ticker) observations, NULL scores zero-padded).
          </p>
        </div>
        <Link href="/backtest" className="text-sm hover:underline">← Backtest</Link>
      </header>
      <p className="text-sm text-muted italic">
        How to read: each cell is the average within-date rank correlation between two signals across the lookback window.
        Cells near +1 / −1 indicate the signals carry the same information on a given day (one of them is redundant).
        Near 0 means they're orthogonal — both worth keeping in a composite. ✓ marks t = |r|/SE &gt; 2;
        ✓✓ marks &gt; 3 (significant after multiple-testing per Harvey-Liu-Zhu).
      </p>
      <CorrelationMatrix title="Spearman (rank — primary)" matrix={spear} nThreshold={N_DATES_THRESHOLD} />
      <CorrelationMatrix title="Pearson (linear — for comparison; saturates at score=1.0)" matrix={pear} nThreshold={N_DATES_THRESHOLD} />
    </main>
  );
}
