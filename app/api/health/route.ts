import { NextResponse } from 'next/server';
import { getProviderHealth } from '@/lib/db/queries/health';

export async function GET() {
  return NextResponse.json({ providers: getProviderHealth() });
}
