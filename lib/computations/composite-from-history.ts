import type { BacktestHistoryRow } from '@/lib/db/queries/backtest-history';
import type { Weights } from '@/lib/computations/discovery';

export type CompositeScorePoint = { date: string; compositeScore: number };

export function composeFromHistory(
  rows: BacktestHistoryRow[],
  weights: Weights,
): CompositeScorePoint[] {
  const totalWeight = Object.values(weights).reduce((s, w) => s + w, 0) || 1;
  const byDate = new Map<string, number>();
  for (const r of rows) {
    const w = weights[r.signal_kind as keyof Weights] ?? 0;
    if (w === 0) continue;
    byDate.set(r.date, (byDate.get(r.date) ?? 0) + r.score * w);
  }
  return Array.from(byDate.entries())
    .map(([date, weightedSum]) => ({ date, compositeScore: weightedSum / totalWeight }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
