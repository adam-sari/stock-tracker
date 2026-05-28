import Link from 'next/link';
import type { SimRow } from '@/lib/watchlist/sim-pnl';

type Props = { rows: SimRow[] };

function pct(n: number) { return `${(n * 100).toFixed(2)}%`; }
function pctClass(n: number) { return n >= 0 ? 'text-up' : 'text-down'; }
function statusClass(s: SimRow['status']) {
  if (s === 'delisted') return 'opacity-50';
  if (s === 'stale')    return 'opacity-70';
  return '';
}
function statusLabel(r: SimRow): string | null {
  if (r.status === 'delisted') return `delisted ${r.delistDate}`;
  if (r.status === 'stale')    return `stale (last ${r.exitDate})`;
  return null;
}

export function SimPnLTable({ rows }: Props) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted italic">Your watchlist is empty or has no price coverage yet.</p>;
  }
  return (
    <table className="text-sm w-full">
      <thead>
        <tr>
          <th className="text-left">Ticker</th>
          <th className="text-left">Entry</th>
          <th className="text-right">Entry $</th>
          <th className="text-right">Exit $</th>
          <th className="text-right">Return</th>
          <th className="text-right">SPY</th>
          <th className="text-right">Excess</th>
          <th className="text-right">Days</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.ticker} className={statusClass(r.status)}>
            <td>
              <Link href={`/stock/${r.ticker}`} className="hover:underline">{r.ticker}</Link>
              {statusLabel(r) && <span className="ml-2 text-xs text-muted italic">{statusLabel(r)}</span>}
            </td>
            <td className="text-muted">{r.entryDate}</td>
            <td className="text-right tabular-nums">{r.entryClose.toFixed(2)}</td>
            <td className="text-right tabular-nums">{r.exitClose.toFixed(2)}</td>
            <td className={`text-right tabular-nums ${pctClass(r.returnPct)}`}>{pct(r.returnPct)}</td>
            <td className="text-right tabular-nums text-muted">{pct(r.spyReturnPct)}</td>
            <td className={`text-right tabular-nums ${pctClass(r.spyExcessPct)}`}>{pct(r.spyExcessPct)}</td>
            <td className="text-right text-muted">{r.daysHeld}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
