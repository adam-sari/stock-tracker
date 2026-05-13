import type { PortfolioValue } from '@/lib/computations/portfolio';

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const pct = (n: number) => `${(n * 100).toFixed(2)}%`;

export function PortfolioSummary({ value }: { value: PortfolioValue }) {
  const up = value.total_pnl >= 0;
  return (
    <div className="rounded border border-border p-4 flex flex-col gap-2">
      <div className="flex items-baseline gap-3">
        <span className="text-muted text-sm uppercase tracking-wide">Portfolio value</span>
        <span className="text-2xl font-semibold tabular-nums">{money(value.total_value)}</span>
      </div>
      <div className="flex gap-6 text-sm">
        <div>
          <div className="text-muted text-xs uppercase">Total P&amp;L</div>
          <div className={`tabular-nums ${up ? 'text-up' : 'text-down'}`}>
            {money(value.total_pnl)} ({pct(value.total_pnl_pct)})
          </div>
        </div>
        <div>
          <div className="text-muted text-xs uppercase">Cost basis</div>
          <div className="tabular-nums">{money(value.total_cost)}</div>
        </div>
      </div>
    </div>
  );
}
