import { NextResponse } from 'next/server';
import { listHoldings } from '@/lib/db/queries/holdings';
import { listWatchlist } from '@/lib/db/queries/watchlist';
import { listActivityForTickers } from '@/lib/db/queries/activity';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') ?? '30')));
  try {
    const tickers = new Set<string>();
    for (const h of listHoldings()) tickers.add(h.ticker.toUpperCase());
    for (const w of listWatchlist()) tickers.add(w.ticker.toUpperCase());
    const events = listActivityForTickers([...tickers], limit);
    return NextResponse.json({ events });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
