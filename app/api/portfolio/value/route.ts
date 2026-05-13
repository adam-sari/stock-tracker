import { NextResponse } from 'next/server';
import { listHoldings } from '@/lib/db/queries/holdings';
import { computePortfolioValue, type PortfolioValue } from '@/lib/computations/portfolio';
import { quoteChain } from '@/lib/providers';

let _cached: { body: PortfolioValue; expiresAt: number } | null = null;
const CACHE_TTL_MS = 15_000;

export async function GET() {
  const now = Date.now();
  if (_cached && now < _cached.expiresAt) {
    return NextResponse.json(_cached.body);
  }

  const holdings = listHoldings();
  const quotes = new Map<string, number>();
  await Promise.all(
    holdings.map(async h => {
      const q = await quoteChain().getLatestQuote(h.ticker);
      if (q) quotes.set(h.ticker, q.price);
    })
  );
  const value = computePortfolioValue(holdings, quotes);

  _cached = { body: value, expiresAt: now + CACHE_TTL_MS };
  return NextResponse.json(value);
}
