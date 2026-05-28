import type { BacktestHistoryRow } from '@/lib/db/queries/backtest-history';

const SIGNAL_ORDER = ['insider', 'congress', 'funds', 'halts', 'volume', 'sentiment'] as const;

type Props = { rows: BacktestHistoryRow[]; ticker: string; inUniverse: boolean };

export function BacktestHistoryTable({ rows, ticker, inUniverse }: Props) {
  const byDate = new Map<string, Map<string, number>>();
  for (const r of rows) {
    if (!byDate.has(r.date)) byDate.set(r.date, new Map());
    byDate.get(r.date)!.set(r.signal_kind, r.score);
  }
  const dates = Array.from(byDate.keys()).sort().reverse();
  if (dates.length === 0) {
    return (
      <p className="text-sm text-muted italic">
        {inUniverse
          ? `No backtest scores yet for ${ticker}.`
          : `${ticker} is not in the backtest universe (SP500 currently-listed only — see project notes on survivorship).`}
      </p>
    );
  }
  return (
    <table className="text-sm w-full">
      <thead>
        <tr>
          <th className="text-left font-normal text-muted">Date</th>
          {SIGNAL_ORDER.map(k => <th key={k} className="text-right font-normal text-muted">{k}</th>)}
        </tr>
      </thead>
      <tbody>
        {dates.map(d => (
          <tr key={d}>
            <td className="text-muted">{d}</td>
            {SIGNAL_ORDER.map(k => {
              const v = byDate.get(d)!.get(k);
              return (
                <td key={k} className="text-right tabular-nums">
                  {v === undefined ? <span className="text-muted">—</span> : v.toFixed(2)}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
