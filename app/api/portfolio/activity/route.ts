import { NextResponse } from 'next/server';
import { listHoldings } from '@/lib/db/queries/holdings';
import { listWatchlist } from '@/lib/db/queries/watchlist';
import { listActivityForTickers } from '@/lib/db/queries/activity';

const CACHE_TTL_MS = 30_000;
const _cache = new Map<number, { body: unknown; expiresAt: number }>();

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') ?? '30')));
  const now = Date.now();
  const cached = _cache.get(limit);
  if (cached && now < cached.expiresAt) {
    return NextResponse.json(cached.body);
  }
  try {
    const tickers = new Set<string>();
    for (const h of listHoldings()) tickers.add(h.ticker.toUpperCase());
    for (const w of listWatchlist()) tickers.add(w.ticker.toUpperCase());
    const events = listActivityForTickers([...tickers], limit);
    const body = { events };
    _cache.set(limit, { body, expiresAt: now + CACHE_TTL_MS });
    return NextResponse.json(body);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
