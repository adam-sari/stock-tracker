type Props = {
  horizon: number;
  hitRate: number;
  n: number;
  meanSpyExcess: number;
};

function colorClass(hitRate: number, n: number): string {
  if (n === 0) return 'text-muted';
  if (hitRate >= 0.55) return 'text-green-500';
  if (hitRate < 0.45) return 'text-red-500';
  return 'text-yellow-500';
}

export function HitRateCard({ horizon, hitRate, n, meanSpyExcess }: Props) {
  const cls = colorClass(hitRate, n);
  const pct = n === 0 ? '—' : `${(hitRate * 100).toFixed(0)}%`;
  const excess = n === 0 ? '' : `${meanSpyExcess > 0 ? '+' : ''}${(meanSpyExcess * 100).toFixed(2)}%`;
  return (
    <div className="rounded border border-default p-3 min-w-[120px]">
      <div className="text-xs text-muted">{horizon}D hit rate</div>
      <div className={`text-2xl font-semibold ${cls}`}>{pct}</div>
      <div className="text-xs text-muted mt-1">n={n}</div>
      {n > 0 && (
        <div className="text-xs text-muted">mean SPY-excess {excess}</div>
      )}
    </div>
  );
}
