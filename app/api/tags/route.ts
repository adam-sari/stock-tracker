import { NextResponse } from 'next/server';
import { listAllTags } from '@/lib/db/queries/tags';

export async function GET() {
  try {
    return NextResponse.json({ tags: listAllTags() });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
