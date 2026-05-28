import type { SimAggregate } from '@/lib/watchlist/sim-pnl';

type Props = { aggregate: SimAggregate; asOfDate: string };

export function SimPnLSummary({ aggregate, asOfDate }: Props) {
  if (aggregate.n === 0) return null;
  return (
    <section className="rounded border border-default p-4">
      <div className="flex gap-6 flex-wrap mb-3">
        <Stat label="Tickers" value={aggregate.n.toString()} />
        <Stat label="As of" value={asOfDate} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SubCard title="Per-ticker mean">
          <Stat label="Mean return"  value={`${(aggregate.perTickerMean.returnPct * 100).toFixed(2)}%`}
            cls={aggregate.perTickerMean.returnPct >= 0 ? 'text-up' : 'text-down'} />
          <Stat label="Mean vs SPY"  value={`${(aggregate.perTickerMean.spyExcessPct * 100).toFixed(2)}%`}
            cls={aggregate.perTickerMean.spyExcessPct >= 0 ? 'text-up' : 'text-down'} />
          <Stat label="Hit rate"     value={`${(aggregate.perTickerMean.hitRate * 100).toFixed(0)}%`} />
        </SubCard>
        <SubCard title={`Equal-weight portfolio (${aggregate.portfolio.activeN} active)`}>
          <Stat label="Portfolio return" value={`${(aggregate.portfolio.returnPct * 100).toFixed(2)}%`}
            cls={aggregate.portfolio.returnPct >= 0 ? 'text-up' : 'text-down'} />
          <Stat label="vs SPY"           value={`${(aggregate.portfolio.spyExcessPct * 100).toFixed(2)}%`}
            cls={aggregate.portfolio.spyExcessPct >= 0 ? 'text-up' : 'text-down'} />
        </SubCard>
      </div>
    </section>
  );
}

function SubCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs uppercase text-muted mb-1">{title}</h3>
      <div className="flex gap-4 flex-wrap">{children}</div>
    </div>
  );
}

function Stat({ label, value, cls = '' }: { label: string; value: string; cls?: string }) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className={`text-xl tabular-nums ${cls}`}>{value}</div>
    </div>
  );
}
