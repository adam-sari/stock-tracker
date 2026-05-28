import type { PerSignal } from '@/lib/backtest/summary-reader';

const KNOWN_SIGNALS = ['insider', 'congress', 'funds', 'halts', 'volume', 'sentiment'] as const;

type Props = {
  horizons: number[];
  perSignal: PerSignal[];
};

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

function NoDataRow({ kind, horizonsLength }: { kind: string; horizonsLength: number }) {
  return (
    <tr>
      <td className="text-muted">{kind}</td>
      <td colSpan={1 + horizonsLength} className="text-muted italic">(no data)</td>
    </tr>
  );
}

export function PerSignalGrid({ horizons, perSignal }: Props) {
  const bySignalKind = new Map(perSignal.map(s => [s.kind, s]));

  return (
    <section className="rounded border border-default p-4">
      <h2 className="text-sm font-semibold mb-2 text-muted">Per signal</h2>
      <table className="text-sm w-full">
        <thead>
          <tr>
            <th className="text-left font-normal text-muted">Signal</th>
            <th className="text-right font-normal text-muted">N obs</th>
            {horizons.map(h => (
              <th key={h} className="text-right font-normal">IC {h}D</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {KNOWN_SIGNALS.map(kind => {
            const sig = bySignalKind.get(kind);
            if (!sig) return <NoDataRow key={kind} kind={kind} horizonsLength={horizons.length} />;
            if (!sig.ic) {
              return (
                <tr key={kind}>
                  <td className="text-muted">{kind}</td>
                  <td className="text-right">{sig.n_obs}</td>
                  <td colSpan={horizons.length} className="text-muted italic">
                    (event-study: see full report)
                  </td>
                </tr>
              );
            }
            return (
              <tr key={kind}>
                <td className="text-muted">{kind}</td>
                <td className="text-right">{sig.n_obs}</td>
                {horizons.map(h => {
                  const ic = sig.ic![String(h)];
                  if (!ic) return <td key={h} className="text-right">n/a</td>;
                  return (
                    <td key={h} className="text-right">
                      {fmt(ic.mean)} {tstatMark(ic.t_stat)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
