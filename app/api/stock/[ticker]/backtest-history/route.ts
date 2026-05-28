import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/connection';
import { getBacktestHistoryForTicker } from '@/lib/db/queries/backtest-history';

export async function GET(_req: Request, { params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  try {
    return NextResponse.json({ history: getBacktestHistoryForTicker(getDb(), ticker, 90) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
