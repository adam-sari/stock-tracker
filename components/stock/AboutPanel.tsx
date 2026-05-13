type StockMeta = {
  ticker: string;
  name?: string | null;
  description?: string | null;
  industry?: string | null;
  sector?: string | null;
  exchange?: string | null;
  market_cap?: number | null;
  ipo_date?: string | null;
  weburl?: string | null;
  ceo?: string | null;
  employees?: number | null;
};

const fmtNum = (n: number) => {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toLocaleString()}`;
};

export function AboutPanel({ meta }: { meta: StockMeta | null }) {
  if (!meta) {
    return <div className="text-muted">Company metadata not yet available. Wait for the next refresh-stock-meta job (weekly).</div>;
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <Stat label="Sector" value={meta.sector} />
        <Stat label="Industry" value={meta.industry} />
        <Stat label="Market cap" value={meta.market_cap ? fmtNum(meta.market_cap) : null} />
        <Stat label="Exchange" value={meta.exchange} />
        <Stat label="CEO" value={meta.ceo} />
        <Stat label="Employees" value={meta.employees ? meta.employees.toLocaleString() : null} />
        <Stat label="IPO" value={meta.ipo_date} />
        <Stat label="Website" value={meta.weburl ? <a href={meta.weburl} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">{new URL(meta.weburl).hostname}</a> : null} />
      </div>
      {meta.description && (
        <p className="text-sm text-muted leading-relaxed whitespace-pre-wrap">{meta.description}</p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase text-muted">{label}</div>
      <div className="tabular-nums">{value ?? '—'}</div>
    </div>
  );
}
