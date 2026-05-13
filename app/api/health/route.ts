import { NextResponse } from 'next/server';
import { getProviderHealth } from '@/lib/db/queries/health';
import { applySchema } from '@/lib/db/migrate';

export async function GET() {
  try {
    applySchema();
    return NextResponse.json({ providers: getProviderHealth() });
  } catch {
    return NextResponse.json({ providers: [] });
  }
}
