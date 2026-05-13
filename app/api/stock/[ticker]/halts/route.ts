import { NextResponse } from 'next/server';
import { listHaltsForTicker } from '@/lib/db/queries/reads';

export async function GET(_req: Request, { params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  try {
    return NextResponse.json({ halts: listHaltsForTicker(ticker) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
