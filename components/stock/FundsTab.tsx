'use client';

import { useEffect, useState } from 'react';

type FundHolding = {
  filing_accession: string;
  cik: string;
  fund_name: string | null;
  ticker: string;
  shares: number;
  value_usd: number;
  period_end: string;
  filed_at: number;
  delta_shares: number | null;
  delta_pct: number | null;
};

function FundsSkeleton() {
  return (
    <table className="w-full text-sm">
      <thead className="text-muted uppercase text-xs">
        <tr><th className="text-left py-2">Fund</th><th className="text-right">Shares</th><th className="text-right">Value</th><th className="text-right">QoQ Δ</th><th className="text-right">Period</th></tr>
      </thead>
      <tbody>
        {[1, 2, 3, 4].map(i => (
          <tr key={i} className="border-t border-border">
            <td className="py-2"><div className="animate-pulse bg-panel rounded h-4 w-40" /></td>
            <td><div className="animate-pulse bg-panel rounded h-4 w-16 ml-auto" /></td>
            <td><div className="animate-pulse bg-panel rounded h-4 w-16 ml-auto" /></td>
            <td><div className="animate-pulse bg-panel rounded h-4 w-14 ml-auto" /></td>
            <td><div className="animate-pulse bg-panel rounded h-4 w-20 ml-auto" /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const fmtShares = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n.toLocaleString();
const fmtUsd = (n: number) => n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${n.toLocaleString()}`;

export function FundsTab({ ticker }: { ticker: string }) {
  const [items, setItems] = useState<FundHolding[] | null>(null);

  useEffect(() => {
    fetch(`/api/stock/${ticker}/funds`).then(r => r.json()).then(d => setItems(d.funds ?? [])).catch(() => setItems([]));
  }, [ticker]);

  if (items === null) return <FundsSkeleton />;
  if (items.length === 0) return <div className="text-muted">No 13F holdings ingested yet. The weekly scanner populates this.</div>;

  return (
    <table className="w-full text-sm">
      <thead className="text-muted uppercase text-xs">
        <tr><th className="text-left py-2">Fund</th><th className="text-right">Shares</th><th className="text-right">Value</th><th className="text-right">QoQ Δ</th><th className="text-right">Period</th></tr>
      </thead>
      <tbody>
        {items.map(h => (
          <tr key={h.filing_accession + h.cik} className="border-t border-border">
            <td className="py-2">{h.fund_name ?? `CIK ${h.cik}`}</td>
            <td className="text-right tabular-nums">{fmtShares(h.shares)}</td>
            <td className="text-right tabular-nums">{fmtUsd(h.value_usd)}</td>
            <td className={`text-right tabular-nums ${(h.delta_shares ?? 0) >= 0 ? 'text-up' : 'text-down'}`}>
              {h.delta_shares !== null ? `${h.delta_shares >= 0 ? '+' : ''}${fmtShares(h.delta_shares)}` : '—'}
            </td>
            <td className="text-right tabular-nums">{h.period_end}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
