import Link from 'next/link';
import type { PredictionWithPIRow } from '@/lib/backtest/predictions-queries';

type Props = { rows: PredictionWithPIRow[] };

function ReturnCell({ value, excess }: { value: number | null; excess: number | null }) {
  if (value === null || value === undefined) {
    return <td className="text-right text-muted">—</td>;
  }
  const cls = value > 0 ? 'text-green-500' : value < 0 ? 'text-red-500' : 'text-muted';
  const sign = value > 0 ? '+' : '';
  const pct = `${sign}${(value * 100).toFixed(2)}%`;
  const excessStr = excess !== null && excess !== undefined
    ? ` (${excess > 0 ? '+' : ''}${(excess * 100).toFixed(2)}%)`
    : '';
  return (
    <td className={`text-right tabular-nums ${cls}`} title={`vs SPY${excessStr}`}>
      {pct}
    </td>
  );
}

function PIBandCell({ lower, upper }: { lower: number | null; upper: number | null }) {
  if (lower === null || upper === null) {
    return <td className="text-right text-muted">—</td>;
  }
  const fmt = (v: number) => `${v > 0 ? '+' : ''}${(v * 100).toFixed(1)}%`;
  return (
    <td className="text-right tabular-nums text-muted">
      {fmt(lower)} to {fmt(upper)}
    </td>
  );
}

function InPICell({ value }: { value: boolean | null }) {
  if (value === null) return <td className="text-center text-muted">—</td>;
  return (
    <td className={`text-center ${value ? 'text-green-500' : 'text-red-500'}`}>
      {value ? '✓' : '✗'}
    </td>
  );
}

export function PredictionsTable({ rows }: Props) {
  return (
    <table className="text-sm w-full">
      <thead>
        <tr className="text-muted text-left">
          <th className="font-normal">Date</th>
          <th className="font-normal">Ticker</th>
          <th className="font-normal">Signal</th>
          <th className="font-normal text-right">Score</th>
          <th className="font-normal text-right">21D</th>
          <th className="font-normal text-right">21d PI</th>
          <th className="font-normal text-center">In PI</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={`${r.date}-${r.ticker}-${r.signal_kind}`}>
            <td className="text-muted">{r.date}</td>
            <td>
              <Link href={`/stock/${r.ticker}`} className="hover:underline">
                {r.ticker}
              </Link>
            </td>
            <td className="text-muted">{r.signal_kind}</td>
            <td className="text-right tabular-nums">{r.score.toFixed(2)}</td>
            <ReturnCell value={r.return_21d} excess={r.spy_excess_21d} />
            <PIBandCell lower={r.lower_21d} upper={r.upper_21d} />
            <InPICell value={r.in_pi_21d} />
          </tr>
        ))}
      </tbody>
    </table>
  );
}
