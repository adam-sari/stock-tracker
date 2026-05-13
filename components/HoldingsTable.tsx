import Link from 'next/link';
import type { PortfolioRow } from '@/lib/computations/portfolio';

type Props = { rows: PortfolioRow[]; tagsByTicker?: Record<string, string[]> };

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const pct = (n: number) => `${(n * 100).toFixed(2)}%`;

export function HoldingsTable({ rows, tagsByTicker = {} }: Props) {
  if (rows.length === 0) {
    return (
      <div className="rounded border border-border p-6 text-muted">
        No holdings yet. Add one with the button above.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
    <table className="w-full text-sm min-w-[640px]">
      <thead className="text-muted uppercase text-xs">
        <tr>
          <th className="text-left py-2">Ticker</th>
          <th className="text-left">Tags</th>
          <th className="text-right">Qty</th>
          <th className="text-right">Avg cost</th>
          <th className="text-right">Price</th>
          <th className="text-right">Mkt value</th>
          <th className="text-right">P&amp;L</th>
          <th className="text-right">P&amp;L %</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.ticker} className="border-t border-border hover:bg-panel/40">
            <td className="py-2">
              <Link href={`/stock/${r.ticker}`} className="text-accent hover:underline">{r.ticker}</Link>
              {r.stale && <span className="ml-2 text-xs text-muted">(stale)</span>}
            </td>
            <td>
              <div className="flex flex-wrap gap-1">
                {(tagsByTicker[r.ticker] ?? []).map(tag => (
                  <span key={tag} className="text-xs px-1.5 py-0.5 rounded-full bg-accent/20 text-accent border border-accent/30">{tag}</span>
                ))}
              </div>
            </td>
            <td className="text-right tabular-nums">{r.qty}</td>
            <td className="text-right tabular-nums">{money(r.avg_cost)}</td>
            <td className="text-right tabular-nums">{r.stale ? '—' : money(r.current_price)}</td>
            <td className="text-right tabular-nums">{money(r.market_value)}</td>
            <td className={`text-right tabular-nums ${r.pnl >= 0 ? 'text-up' : 'text-down'}`}>{money(r.pnl)}</td>
            <td className={`text-right tabular-nums ${r.pnl >= 0 ? 'text-up' : 'text-down'}`}>{pct(r.pnl_pct)}</td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}
