'use client';

import { useEffect, useState } from 'react';

type CongressTrade = {
  id: string;
  ticker: string;
  chamber: 'house' | 'senate';
  member: string;
  district: string;
  party: string | null;
  kind: string;
  amount_low: number | null;
  amount_high: number | null;
  txn_date: string;
  disclosed_at: number;
  ptr_url: string;
};

const KIND_COLOR: Record<string, string> = { Purchase: 'text-up', Sale: 'text-down', Exchange: 'text-muted' };

export function CongressTab({ ticker }: { ticker: string }) {
  const [items, setItems] = useState<CongressTrade[] | null>(null);

  useEffect(() => {
    fetch(`/api/stock/${ticker}/congress`).then(r => r.json()).then(d => setItems(d.congress ?? [])).catch(() => setItems([]));
  }, [ticker]);

  if (items === null) return <div className="text-muted">Loading…</div>;
  if (items.length === 0) return <div className="text-muted">No Congressional trades on file for {ticker}.</div>;

  return (
    <table className="w-full text-sm">
      <thead className="text-muted uppercase text-xs">
        <tr><th className="text-left py-2">Member</th><th>Chamber</th><th>Kind</th><th className="text-right">Amount</th><th className="text-right">Date</th></tr>
      </thead>
      <tbody>
        {items.map(t => (
          <tr key={t.id} className="border-t border-border">
            <td className="py-2">
              <a href={t.ptr_url} target="_blank" rel="noopener noreferrer" className="hover:text-accent">{t.member}</a>
              <span className="text-xs text-muted ml-2">{t.district}</span>
            </td>
            <td className="capitalize">{t.chamber}</td>
            <td className={KIND_COLOR[t.kind] ?? ''}>{t.kind}</td>
            <td className="text-right tabular-nums">${(t.amount_low ?? 0).toLocaleString()} – ${(t.amount_high ?? 0).toLocaleString()}</td>
            <td className="text-right tabular-nums">{t.txn_date}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
