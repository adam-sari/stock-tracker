import { NextResponse } from 'next/server';
import { listInsidersForTicker } from '@/lib/db/queries/reads';

export async function GET(_req: Request, { params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  try {
    return NextResponse.json({ insiders: listInsidersForTicker(ticker) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
