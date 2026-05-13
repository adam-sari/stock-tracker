import type { Transaction } from '../db/queries/transactions';

export type CandlePoint = { ts: number; close: number };
export type SeriesPoint = { ts: number; value: number; cost_basis: number };

/**
 * Binary search: find the largest index i such that arr[i].ts <= target.
 * Returns -1 if no such index exists.
 */
function bisectRight(arr: CandlePoint[], target: number): number {
  let lo = 0;
  let hi = arr.length - 1;
  let result = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid].ts <= target) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}

/**
 * Compute a portfolio value time series.
 *
 * @param transactions - All transactions sorted by executed_at ASC
 * @param candlesByTicker - Map of ticker → sorted candles (ts ASC) for each held ticker
 * @param start - Start of the range (inclusive)
 * @param end - End of the range (inclusive)
 * @param interval - '1m' or '1d' (for documentation; the candles determine what timestamps are emitted)
 *
 * @returns Series sorted by ts ASC. Each point has:
 *   - ts: Unix timestamp (seconds for 1d candles, seconds for 1m candles)
 *   - value: Sum of qty * close for all holdings at this ts
 *   - cost_basis: Sum of accumulated cost across all buy transactions up to ts
 *
 * Edge cases:
 *   - Ticker with no candles in range → contributes 0 value (skipped)
 *   - Negative net qty (sells exceed buys) → treated as 0
 *   - Empty portfolio (no transactions with buys) → returns []
 */
export function computePortfolioSeries(
  transactions: Transaction[],
  candlesByTicker: Map<string, CandlePoint[]>,
  start: Date,
  end: Date,
): SeriesPoint[] {
  if (transactions.length === 0) return [];

  const startTs = Math.floor(start.getTime() / 1000);
  const endTs = Math.floor(end.getTime() / 1000);

  // Build a sorted union of all candle timestamps in [startTs, endTs]
  const allTs = new Set<number>();
  for (const candles of candlesByTicker.values()) {
    for (const c of candles) {
      if (c.ts >= startTs && c.ts <= endTs) {
        allTs.add(c.ts);
      }
    }
  }

  if (allTs.size === 0) return [];

  const sortedTs = Array.from(allTs).sort((a, b) => a - b);

  // Sort transactions by executed_at ASC (already expected sorted, but ensure it)
  const sortedTxns = [...transactions].sort(
    (a, b) => new Date(a.executed_at).getTime() - new Date(b.executed_at).getTime(),
  );

  // Running state: net qty and cost_basis per ticker
  const qtyMap = new Map<string, number>();
  const costMap = new Map<string, number>();
  let txnIdx = 0;
  let totalCostBasis = 0;

  const result: SeriesPoint[] = [];

  for (const ts of sortedTs) {
    // Advance transactions whose executed_at <= ts
    while (txnIdx < sortedTxns.length) {
      const txn = sortedTxns[txnIdx];
      const txnTs = Math.floor(new Date(txn.executed_at).getTime() / 1000);
      if (txnTs > ts) break;

      const prev = qtyMap.get(txn.ticker) ?? 0;
      const prevCost = costMap.get(txn.ticker) ?? 0;

      if (txn.kind === 'buy') {
        qtyMap.set(txn.ticker, prev + txn.qty);
        const addedCost = txn.qty * txn.price;
        costMap.set(txn.ticker, prevCost + addedCost);
        totalCostBasis += addedCost;
      } else {
        // sell: reduce qty and proportionally reduce cost basis
        const newQty = Math.max(0, prev - txn.qty);
        qtyMap.set(txn.ticker, newQty);
        if (prev > 0) {
          const costReduction = (txn.qty / prev) * prevCost;
          const newCost = Math.max(0, prevCost - costReduction);
          const actualReduction = prevCost - newCost;
          costMap.set(txn.ticker, newCost);
          totalCostBasis = Math.max(0, totalCostBasis - actualReduction);
        }
      }
      txnIdx++;
    }

    // Compute total value at this ts
    let totalValue = 0;
    for (const [ticker, qty] of qtyMap.entries()) {
      if (qty <= 0) continue;
      const candles = candlesByTicker.get(ticker);
      if (!candles || candles.length === 0) continue;
      const idx = bisectRight(candles, ts);
      if (idx < 0) continue; // no candle at or before this ts
      totalValue += qty * candles[idx].close;
    }

    result.push({ ts, value: totalValue, cost_basis: totalCostBasis });
  }

  return result;
}
