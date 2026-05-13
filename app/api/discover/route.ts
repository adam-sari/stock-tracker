import { NextResponse } from 'next/server';
import { listDiscoveryTopN } from '@/lib/db/queries/discovery';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(200, Number(url.searchParams.get('limit') ?? '50'));
  const filter = url.searchParams.get('signals')?.split(',').filter(Boolean) ?? [];
  try {
    let rows = listDiscoveryTopN(Math.max(1, limit));
    if (filter.length > 0) {
      rows = rows.filter(r => {
        const sigs = JSON.parse(r.signals_json) as Array<{ kind: string }>;
        return sigs.some(s => filter.includes(s.kind));
      });
    }
    return NextResponse.json({
      items: rows.map(r => ({
        ticker: r.ticker,
        score: r.score,
        signals: JSON.parse(r.signals_json),
        computed_at: r.computed_at,
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
