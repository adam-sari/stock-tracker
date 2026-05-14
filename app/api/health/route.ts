import { NextResponse } from 'next/server';
import { getProviderHealth } from '@/lib/db/queries/health';
import { healthCache } from '@/lib/cache/health-cache';

export async function GET() {
  const cached = healthCache.get();
  if (cached) return NextResponse.json(cached);
  try {
    const body = { providers: getProviderHealth() };
    healthCache.set(body);
    return NextResponse.json(body);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
