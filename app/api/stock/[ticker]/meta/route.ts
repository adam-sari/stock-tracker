import { NextResponse } from 'next/server';
import { getStockMeta } from '@/lib/db/queries/stock-meta';

export async function GET(_req: Request, { params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  try {
    return NextResponse.json({ meta: getStockMeta(ticker) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
