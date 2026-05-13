import { NextResponse } from 'next/server';
import { getProviderHealth } from '@/lib/db/queries/health';

const CACHE_TTL_MS = 30_000;
let _cached: { body: unknown; expiresAt: number } | null = null;

/** Exported so tests can reset module-level cache between runs. */
export function _resetCache() { _cached = null; }

export async function GET() {
  const now = Date.now();
  if (_cached && now < _cached.expiresAt) {
    return NextResponse.json(_cached.body);
  }
  try {
    const body = { providers: getProviderHealth() };
    _cached = { body, expiresAt: now + CACHE_TTL_MS };
    return NextResponse.json(body);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
