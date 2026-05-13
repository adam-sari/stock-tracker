import { NextResponse } from 'next/server';
import { listHoldings } from '@/lib/db/queries/holdings';
import { computePortfolioValue } from '@/lib/computations/portfolio';
import { quoteChain } from '@/lib/providers';

export async function GET() {
  const holdings = listHoldings();
  const quotes = new Map<string, number>();
  await Promise.all(
    holdings.map(async h => {
      const q = await quoteChain().getLatestQuote(h.ticker);
      if (q) quotes.set(h.ticker, q.price);
    })
  );
  const value = computePortfolioValue(holdings, quotes);
  return NextResponse.json(value);
}
