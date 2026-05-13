import { NextResponse } from 'next/server';
import { listHoldings } from '@/lib/db/queries/holdings';
import { getDb } from '@/lib/db/connection';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const daysAhead = Math.min(180, Math.max(1, Number(url.searchParams.get('days') ?? '30')));
  try {
    const holdings = listHoldings();
    if (holdings.length === 0) return NextResponse.json({ earnings: [] });
    const tickers = holdings.map(h => h.ticker.toUpperCase());
    const placeholders = tickers.map(() => '?').join(',');
    const today = new Date().toISOString().slice(0, 10);
    const future = new Date(Date.now() + daysAhead * 86400_000).toISOString().slice(0, 10);
    const rows = getDb().prepare(`
      SELECT ticker, earnings_date, hour, eps_estimate, eps_actual, revenue_estimate, revenue_actual, num_estimates
      FROM earnings_calendar
      WHERE ticker IN (${placeholders})
        AND earnings_date >= ?
        AND earnings_date <= ?
      ORDER BY earnings_date ASC
    `).all(...tickers, today, future);
    return NextResponse.json({ earnings: rows });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
