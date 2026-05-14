import { NextResponse } from 'next/server';
import { listHoldings } from '@/lib/db/queries/holdings';
import { getDb } from '@/lib/db/connection';

const CACHE_TTL_MS = 5 * 60_000;
const _cache = new Map<number, { body: unknown; expiresAt: number }>();

export async function GET(req: Request) {
  const url = new URL(req.url);
  const rawDays = Number(url.searchParams.get('days'));
  const daysAhead = Math.min(180, Math.max(1, Number.isFinite(rawDays) && rawDays > 0 ? rawDays : 30));
  const now = Date.now();
  const cached = _cache.get(daysAhead);
  if (cached && now < cached.expiresAt) {
    return NextResponse.json(cached.body);
  }
  try {
    const holdings = listHoldings();
    if (holdings.length === 0) {
      const body = { earnings: [] };
      _cache.set(daysAhead, { body, expiresAt: now + CACHE_TTL_MS });
      return NextResponse.json(body);
    }
    const tickers = holdings.map(h => h.ticker.toUpperCase());
    const placeholders = tickers.map(() => '?').join(',');
    const today = new Date().toISOString().slice(0, 10);
    const future = new Date(now + daysAhead * 86400_000).toISOString().slice(0, 10);
    const rows = getDb().prepare(`
      SELECT ticker, earnings_date, hour, eps_estimate, eps_actual, revenue_estimate, revenue_actual, num_estimates
      FROM earnings_calendar
      WHERE ticker IN (${placeholders})
        AND earnings_date >= ?
        AND earnings_date <= ?
      ORDER BY earnings_date ASC
    `).all(...tickers, today, future);
    const body = { earnings: rows };
    _cache.set(daysAhead, { body, expiresAt: now + CACHE_TTL_MS });
    return NextResponse.json(body);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
