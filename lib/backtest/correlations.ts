import type Database from 'better-sqlite3';

const SIGNAL_KINDS = ['insider', 'congress', 'funds', 'halts', 'volume', 'sentiment'] as const;
export type SignalKind = typeof SIGNAL_KINDS[number];

/**
 * Returns rows of shape { date, ticker, insider, congress, funds, halts, volume, sentiment }.
 *
 * Zero-pad NULLs (M2): universe is "all (date, ticker) pairs that exist in candles_daily on a
 * trading day"; missing signal scores become 0 rather than null. "Both fired" semantics introduces
 * a selection bias that distorts every reported r.
 *
 * NYSE trading-day filter (m7) via `EXISTS (SELECT 1 FROM candles_daily WHERE date = bs.date)`
 * drops weekend/holiday rows that replay.ts may have written.
 */
export function pivotScores(db: Database.Database, days: number = 365) {
  const rows = db.prepare(`
    SELECT bs.date, bs.ticker, bs.signal_kind, bs.score
    FROM backtest_scores bs
    WHERE bs.date >= date('now', '-' || ? || ' day')
      AND EXISTS (SELECT 1 FROM candles_daily cd WHERE cd.date = bs.date)
  `).all(days) as Array<{ date: string; ticker: string; signal_kind: SignalKind; score: number }>;

  const byKey = new Map<string, Record<string, number | string>>();
  for (const r of rows) {
    const k = `${r.date}|${r.ticker}`;
    if (!byKey.has(k)) {
      const init: Record<string, number | string> = { date: r.date, ticker: r.ticker };
      for (const s of SIGNAL_KINDS) init[s] = 0;  // zero-pad (M2)
      byKey.set(k, init);
    }
    byKey.get(k)![r.signal_kind] = r.score;
  }
  return Array.from(byKey.values()) as Array<Record<string, number> & { date: string; ticker: string }>;
}

export function pearson(xs: number[], ys: number[]): number {
  if (xs.length < 2 || xs.length !== ys.length) return NaN;
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    num += dx * dy; dx2 += dx * dx; dy2 += dy * dy;
  }
  if (dx2 === 0 || dy2 === 0) return NaN;
  return num / Math.sqrt(dx2 * dy2);
}

export function rankify(xs: number[]): number[] {
  const indexed = xs.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = new Array(xs.length).fill(0);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j + 1 < indexed.length && indexed[j + 1].v === indexed[i].v) j++;
    const midRank = (i + j) / 2 + 1;  // 1-based, midrank for ties
    for (let k = i; k <= j; k++) ranks[indexed[k].i] = midRank;
    i = j + 1;
  }
  return ranks;
}

export function spearman(xs: number[], ys: number[]): number {
  return pearson(rankify(xs), rankify(ys));
}

export type CorrelationMatrix = {
  signals: SignalKind[];
  values: number[][];   // values[i][j] = mean cross-sectional corr(signals[i], signals[j]) across dates
  ses:    number[][];   // SE-across-dates for each pair (std / √n_dates)
  ns:     number[][];   // number of dates that contributed (skipping per-date n<3)
};

/**
 * Average cross-sectional pairwise correlation across dates (M1 fix).
 *
 * For each pair (i, j):
 *   1. Group `wide` rows by `date`.
 *   2. Within each date's cross-section: compute `corrFn(signal_i_values, signal_j_values)`.
 *      Skip dates with fewer than 3 valid observations (Spearman's tie-rank correction degenerate below this).
 *   3. Across surviving dates: report mean ± SE (std-dev / √n_dates).
 *
 * Beats pooled correlation: a pooled `(date, ticker)` Pearson conflates temporal and
 * cross-sectional variance. `funds` is structurally constant for ~63 trading days; pooled
 * correlation against any time-varying signal is corrupted by that persistence pattern.
 */
export function avgCrossSectionalCorrMatrix(
  wide: Array<Record<string, number> & { date: string; ticker: string }>,
  method: 'pearson' | 'spearman' = 'spearman'
): CorrelationMatrix {
  const signals = [...SIGNAL_KINDS];
  const corrFn = method === 'pearson' ? pearson : spearman;

  const byDate = new Map<string, typeof wide>();
  for (const row of wide) {
    if (!byDate.has(row.date)) byDate.set(row.date, []);
    byDate.get(row.date)!.push(row);
  }

  const values: number[][] = signals.map(() => signals.map(() => NaN));
  const ses:    number[][] = signals.map(() => signals.map(() => NaN));
  const ns:     number[][] = signals.map(() => signals.map(() => 0));

  for (let i = 0; i < signals.length; i++) {
    for (let j = i; j < signals.length; j++) {
      const perDateR: number[] = [];
      for (const rows of byDate.values()) {
        if (rows.length < 3) continue;  // skip thin cross-sections (red-team #3)
        const xs = rows.map(r => r[signals[i]]);
        const ys = rows.map(r => r[signals[j]]);
        const r = corrFn(xs, ys);
        if (!Number.isNaN(r)) perDateR.push(r);
      }
      const nDates = perDateR.length;
      if (nDates === 0) {
        values[i][j] = values[j][i] = NaN;
        ses[i][j]    = ses[j][i]    = NaN;
        ns[i][j]     = ns[j][i]     = 0;
        continue;
      }
      const mean = perDateR.reduce((a, b) => a + b, 0) / nDates;
      const variance = nDates < 2 ? 0 : perDateR.reduce((s, r) => s + (r - mean) ** 2, 0) / (nDates - 1);
      const se = Math.sqrt(variance / nDates);
      values[i][j] = values[j][i] = mean;
      ses[i][j]    = ses[j][i]    = se;
      ns[i][j]     = ns[j][i]     = nDates;
    }
  }
  return { signals, values, ses, ns };
}
