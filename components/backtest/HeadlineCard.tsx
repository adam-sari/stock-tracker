import type { ICSummary } from '@/lib/backtest/summary-reader';

type Props = {
  horizons: number[];
  composite_ic: Record<string, ICSummary>;
};

function tstatClass(t: number): string {
  const abs = Math.abs(t);
  if (abs > 3) return 'bg-green-200 text-green-900';
  if (abs > 2) return 'bg-yellow-200 text-yellow-900';
  return '';
}

function tstatMark(t: number): string {
  const abs = Math.abs(t);
  if (abs > 3) return '✓';
  if (abs > 2) return '⚠';
  return '';
}

function fmt(n: number, digits = 4): string {
  if (Number.isNaN(n) || !Number.isFinite(n)) return 'n/a';
  return n.toFixed(digits);
}

export function HeadlineCard({ horizons, composite_ic }: Props) {
  return (
    <section className="rounded border border-default p-4">
      <h2 className="text-sm font-semibold mb-2 text-muted">Headline composite</h2>
      <table className="text-sm w-full">
        <thead>
          <tr>
            <th className="text-left font-normal text-muted">Horizon</th>
            {horizons.map(h => (
              <th key={h} className="text-right font-normal">{h}D</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="text-muted">Rank IC mean</td>
            {horizons.map(h => {
              const ic = composite_ic[String(h)];
              return <td key={h} className="text-right">{ic ? fmt(ic.mean) : 'n/a'}</td>;
            })}
          </tr>
          <tr>
            <td className="text-muted">IC t-stat (NW)</td>
            {horizons.map(h => {
              const ic = composite_ic[String(h)];
              if (!ic) return <td key={h} className="text-right">n/a</td>;
              return (
                <td key={h} className={`text-right px-1 ${tstatClass(ic.t_stat)}`}>
                  {fmt(ic.t_stat, 2)} {tstatMark(ic.t_stat)}
                </td>
              );
            })}
          </tr>
          <tr>
            <td className="text-muted">N obs</td>
            {horizons.map(h => {
              const ic = composite_ic[String(h)];
              return <td key={h} className="text-right">{ic ? ic.n : '-'}</td>;
            })}
          </tr>
        </tbody>
      </table>
      <p className="text-xs text-muted mt-2 italic">
        t-stat &gt; 3.0 = significant after multiple-testing (Harvey-Liu-Zhu). 2.0–3.0 = suggestive.
      </p>
    </section>
  );
}
