import Link from 'next/link';
import type { PredictionRow } from '@/lib/backtest/predictions-queries';

type Props = { rows: PredictionRow[] };

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

export function PredictionsTable({ rows }: Props) {
  return (
    <table className="text-sm w-full">
      <thead>
        <tr className="text-muted text-left">
          <th className="font-normal">Date</th>
          <th className="font-normal">Ticker</th>
          <th className="font-normal">Signal</th>
          <th className="font-normal text-right">Score</th>
          <th className="font-normal text-right">1D</th>
          <th className="font-normal text-right">5D</th>
          <th className="font-normal text-right">21D</th>
          <th className="font-normal text-right">63D</th>
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
            <ReturnCell value={r.return_1d} excess={r.spy_excess_1d} />
            <ReturnCell value={r.return_5d} excess={r.spy_excess_5d} />
            <ReturnCell value={r.return_21d} excess={r.spy_excess_21d} />
            <ReturnCell value={r.return_63d} excess={r.spy_excess_63d} />
          </tr>
        ))}
      </tbody>
    </table>
  );
}
