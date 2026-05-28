import Link from 'next/link';
import type { TopNRow } from '@/lib/backtest/top-n-queries';

type Props = {
  highest: TopNRow[];
  mostSignals: TopNRow[];
  accelerating: TopNRow[];
};

function Panel({
  title,
  rows,
  valueLabel,
}: {
  title: string;
  rows: TopNRow[];
  valueLabel?: (v: number) => string;
}) {
  return (
    <div className="flex-1 min-w-[180px]">
      <h3 className="text-xs font-semibold tracking-wide text-muted mb-2">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-xs italic text-muted">(no scores in window)</p>
      ) : (
        <table className="text-sm w-full">
          <tbody>
            {rows.map(r => (
              <tr key={r.ticker}>
                <td>
                  <Link href={`/stock/${r.ticker}`} className="hover:underline">
                    {r.ticker}
                  </Link>
                </td>
                <td className="text-right tabular-nums">
                  {valueLabel ? valueLabel(r.value) : r.value.toFixed(2)}
                </td>
                <td className="text-right text-xs text-muted pl-2">{r.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function LiveMonitor({ highest, mostSignals, accelerating }: Props) {
  return (
    <section className="rounded border border-default p-4">
      <h2 className="text-sm font-semibold mb-3 text-muted">Live monitor — last 7 days</h2>
      <div className="flex gap-6 flex-wrap">
        <Panel title="HIGHEST SCORE" rows={highest} />
        <Panel
          title="MOST SIGNALS"
          rows={mostSignals}
          valueLabel={v => `${v} signal${v === 1 ? '' : 's'}`}
        />
        <Panel
          title="ACCELERATING"
          rows={accelerating}
          valueLabel={v => (v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2))}
        />
      </div>
    </section>
  );
}
