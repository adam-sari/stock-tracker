import type { CorrelationMatrix as CM } from '@/lib/backtest/correlations';

type Props = {
  title: string;
  matrix: CM;
  /** Minimum n_dates required to color a cell; below this, cell is greyed (M3). */
  nThreshold?: number;
};

function cellClass(v: number, n: number, nThreshold: number): string {
  if (Number.isNaN(v)) return 'bg-neutral-800 text-neutral-400';
  if (n < nThreshold) return 'bg-neutral-800 text-neutral-400';  // M3: n-suppress
  const a = Math.abs(v);
  if (v > 0) {
    if (a > 0.7) return 'bg-green-700 text-white';
    if (a > 0.4) return 'bg-green-500 text-white';
    if (a > 0.2) return 'bg-green-300';
    return '';
  }
  if (a > 0.7) return 'bg-red-700 text-white';
  if (a > 0.4) return 'bg-red-500 text-white';
  if (a > 0.2) return 'bg-red-300';
  return '';
}

/** Significance marker (M3): |r|/SE > 2 → ✓, > 3 → ✓✓. Matches HLZ discipline used in the IC table. */
function sigMark(v: number, se: number): string {
  if (Number.isNaN(v) || Number.isNaN(se) || se === 0) return '';
  const t = Math.abs(v) / se;
  if (t > 3) return ' ✓✓';
  if (t > 2) return ' ✓';
  return '';
}

export function CorrelationMatrix({ title, matrix, nThreshold = 30 }: Props) {
  const { signals, values, ses, ns } = matrix;
  const maxN = Math.max(...ns.flat());
  return (
    <section className="rounded border border-default p-4">
      <h2 className="text-sm font-semibold mb-3 text-muted">{title}</h2>
      <table className="text-sm">
        <thead>
          <tr>
            <th></th>
            {signals.map(s => <th key={s} className="px-2 py-1 text-right font-normal text-muted">{s}</th>)}
          </tr>
        </thead>
        <tbody>
          {signals.map((row, i) => (
            <tr key={row}>
              <th className="px-2 py-1 text-right font-normal text-muted">{row}</th>
              {signals.map((col, j) => {
                const v = values[i][j];
                const se = ses[i][j];
                const n = ns[i][j];
                const text = Number.isNaN(v)
                  ? 'n/a'
                  : `${v.toFixed(2)}${sigMark(v, se)}`;
                return (
                  <td
                    key={col}
                    className={`px-2 py-1 text-right tabular-nums ${cellClass(v, n, nThreshold)}`}
                    title={`r=${v.toFixed(3)}, SE=${se.toFixed(3)}, n_dates=${n}`}
                  >
                    {text}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-muted mt-2 italic">
        Mean cross-sectional correlation across {maxN} dates (max). Cells where n_dates &lt; {nThreshold} are
        greyed out (insufficient sample); ✓ marks |r|/SE &gt; 2 (suggestive), ✓✓ marks &gt; 3 (significant
        after Harvey-Liu-Zhu).
      </p>
    </section>
  );
}
