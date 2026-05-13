import { NextResponse } from 'next/server';
import { z } from 'zod';
import { listWatchlist, addToWatchlist } from '@/lib/db/queries/watchlist';

const bodySchema = z.object({
  ticker: z.string().min(1).max(10),
  source: z.enum(['manual', 'discovery']).optional(),
  note: z.string().optional(),
});

export async function GET() {
  try {
    return NextResponse.json({ watchlist: listWatchlist() });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  try {
    addToWatchlist(parsed.data.ticker, parsed.data.source, parsed.data.note);
    return NextResponse.json({ watchlist: listWatchlist() }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
