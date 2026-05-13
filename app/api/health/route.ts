import { NextResponse } from 'next/server';
import { getProviderHealth } from '@/lib/db/queries/health';

export async function GET() {
  try {
    return NextResponse.json({ providers: getProviderHealth() });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
