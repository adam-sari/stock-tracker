import { NextResponse } from 'next/server';
import { removeFromWatchlist } from '@/lib/db/queries/watchlist';

export async function DELETE(_req: Request, { params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  try {
    removeFromWatchlist(ticker);
    return new Response(null, { status: 204 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
