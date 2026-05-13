import { NextResponse } from 'next/server';
import { listDiscoveryTopN } from '@/lib/db/queries/discovery';

const CACHE_TTL_MS = 60_000;
const _cache = new Map<string, { body: unknown; expiresAt: number }>();

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(200, Number(url.searchParams.get('limit') ?? '50'));
  const filter = url.searchParams.get('signals')?.split(',').filter(Boolean) ?? [];
  // Build a canonical cache key from sorted params
  const cacheKey = JSON.stringify({ limit, signals: [...filter].sort() });
  const now = Date.now();
  const cached = _cache.get(cacheKey);
  if (cached && now < cached.expiresAt) {
    return NextResponse.json(cached.body);
  }
  try {
    let rows = listDiscoveryTopN(Math.max(1, limit));
    if (filter.length > 0) {
      rows = rows.filter(r => {
        const sigs = JSON.parse(r.signals_json) as Array<{ kind: string }>;
        return sigs.some(s => filter.includes(s.kind));
      });
    }
    const body = {
      items: rows.map(r => ({
        ticker: r.ticker,
        score: r.score,
        signals: JSON.parse(r.signals_json),
        computed_at: r.computed_at,
      })),
    };
    _cache.set(cacheKey, { body, expiresAt: now + CACHE_TTL_MS });
    return NextResponse.json(body);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
