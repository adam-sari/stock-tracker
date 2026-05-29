import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/connection';

export type BacktestHistoryPiRow = {
  date: string;
  score: number;
  return_21d: number | null;
  spy_excess_21d: number | null;
  lower_21d: number | null;
  upper_21d: number | null;
};

function getBacktestHistoryWithPi(
  db: ReturnType<typeof getDb>,
  ticker: string,
  days: number,
): BacktestHistoryPiRow[] {
  return db.prepare(`
    SELECT bs.date AS date,
           MAX(bs.score) AS score,
           rr.return_pct AS return_21d,
           rr.spy_excess_pct AS spy_excess_21d,
           pi.lower AS lower_21d,
           pi.upper AS upper_21d
    FROM backtest_scores bs
    LEFT JOIN realized_returns rr
      ON rr.date = bs.date AND rr.ticker = bs.ticker AND rr.horizon_days = 21
    LEFT JOIN prediction_intervals pi
      ON pi.date = bs.date AND pi.ticker = bs.ticker
         AND pi.horizon_days = 21 AND pi.alpha BETWEEN 0.099 AND 0.101
    WHERE bs.ticker = ? AND bs.date >= date('now', '-' || ? || ' day')
    GROUP BY bs.date
    ORDER BY bs.date DESC
  `).all(ticker, days) as BacktestHistoryPiRow[];
}

export async function GET(_req: Request, { params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  try {
    const db = getDb();
    return NextResponse.json({
      rows: getBacktestHistoryWithPi(db, ticker, 90),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
