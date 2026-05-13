import { NextResponse } from 'next/server';
import { listHoldings } from '@/lib/db/queries/holdings';

export async function GET() {
  return NextResponse.json(listHoldings());
}
