import { NextResponse } from 'next/server';
import { quoteChain } from '@/lib/providers';

export async function GET(_req: Request, { params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  const q = await quoteChain().getLatestQuote(ticker);
  if (!q) return NextResponse.json({ error: 'no quote' }, { status: 404 });
  return NextResponse.json(q);
}
