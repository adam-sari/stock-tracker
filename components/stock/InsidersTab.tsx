'use client';

import { useEffect, useState } from 'react';

type InsiderTxn = {
  id: string;
  ticker: string;
  insider_name: string;
  insider_role?: string | null;
  code: string;
  is_derivative: number;
  shares: number;
  price: number | null;
  value: number | null;
  txn_date: string;
  filing_url: string | null;
  source: string;
};

function InsidersSkeleton() {
  return (
    <table className="w-full text-sm">
      <thead className="text-muted uppercase text-xs">
        <tr><th className="text-left py-2">Insider</th><th className="text-left">Type</th><th className="text-right">Shares</th><th className="text-right">Price</th><th className="text-right">Date</th></tr>
      </thead>
      <tbody>
        {[1, 2, 3, 4].map(i => (
          <tr key={i} className="border-t border-border">
            <td className="py-2"><div className="animate-pulse bg-panel rounded h-4 w-32" /></td>
            <td><div className="animate-pulse bg-panel rounded h-4 w-16" /></td>
            <td><div className="animate-pulse bg-panel rounded h-4 w-16 ml-auto" /></td>
            <td><div className="animate-pulse bg-panel rounded h-4 w-14 ml-auto" /></td>
            <td><div className="animate-pulse bg-panel rounded h-4 w-20 ml-auto" /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const CODE_LABEL: Record<string, string> = {
  P: 'Purchase', S: 'Sale', A: 'Grant', M: 'Option exercise', F: 'Tax withhold', G: 'Gift', D: 'Disposition',
};

export function InsidersTab({ ticker }: { ticker: string }) {
  const [items, setItems] = useState<InsiderTxn[] | null>(null);

  useEffect(() => {
    fetch(`/api/stock/${ticker}/insiders`).then(r => r.json()).then(d => setItems(d.insiders ?? [])).catch(() => setItems([]));
  }, [ticker]);

  if (items === null) return <InsidersSkeleton />;
  if (items.length === 0) return <div className="text-muted">No insider transactions ingested yet for {ticker}.</div>;

  return (
    <table className="w-full text-sm">
      <thead className="text-muted uppercase text-xs">
        <tr><th className="text-left py-2">Insider</th><th className="text-left">Type</th><th className="text-right">Shares</th><th className="text-right">Price</th><th className="text-right">Date</th></tr>
      </thead>
      <tbody>
        {items.map(t => (
          <tr key={t.id} className="border-t border-border">
            <td className="py-2">
              {t.filing_url ? <a href={t.filing_url} target="_blank" rel="noopener noreferrer" className="hover:text-accent">{t.insider_name}</a> : t.insider_name}
              {t.is_derivative === 1 && <span className="ml-2 text-xs text-muted">[derivative]</span>}
            </td>
            <td>{CODE_LABEL[t.code] ?? t.code}</td>
            <td className="text-right tabular-nums">{t.shares.toLocaleString()}</td>
            <td className="text-right tabular-nums">{t.price ? `$${t.price.toFixed(2)}` : '—'}</td>
            <td className="text-right tabular-nums">{t.txn_date}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
