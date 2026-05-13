type Props = {
  ticker: string;
  qty: number;
  avgCost: number;
  currentPrice: number | null;
};

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const pct = (n: number) => `${(n * 100).toFixed(2)}%`;

export function PositionPanel({ qty, avgCost, currentPrice }: Props) {
  if (qty === 0) {
    return (
      <div className="rounded border border-border p-3 text-sm text-muted">
        Not in your portfolio.
      </div>
    );
  }
  const totalCost = qty * avgCost;
  const marketValue = currentPrice !== null ? qty * currentPrice : null;
  const pnl = marketValue !== null ? marketValue - totalCost : null;
  const pnlPct = pnl !== null && totalCost ? pnl / totalCost : null;
  const up = (pnl ?? 0) >= 0;
  return (
    <div className="rounded border border-border p-4 flex flex-col gap-1.5 text-sm">
      <div className="text-muted text-xs uppercase tracking-wide">Your position</div>
      <div className="flex justify-between"><span className="text-muted">Qty</span><span className="tabular-nums">{qty}</span></div>
      <div className="flex justify-between"><span className="text-muted">Avg cost</span><span className="tabular-nums">{money(avgCost)}</span></div>
      {marketValue !== null && (
        <>
          <div className="flex justify-between"><span className="text-muted">Mkt value</span><span className="tabular-nums">{money(marketValue)}</span></div>
          <div className={`flex justify-between ${up ? 'text-up' : 'text-down'}`}>
            <span className="text-muted">P&amp;L</span>
            <span className="tabular-nums">{money(pnl!)} ({pct(pnlPct!)})</span>
          </div>
        </>
      )}
    </div>
  );
}
