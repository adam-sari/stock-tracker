import { NextResponse } from 'next/server';
import { z } from 'zod';
import { listTagsForTicker, addTag, removeTag } from '@/lib/db/queries/tags';

const bodySchema = z.object({ tag: z.string().min(1).max(40) });

export async function GET(_req: Request, { params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  try {
    return NextResponse.json({ tags: listTagsForTicker(ticker) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  try {
    addTag(ticker, parsed.data.tag);
    return NextResponse.json({ tags: listTagsForTicker(ticker) }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  const url = new URL(req.url);
  const tag = url.searchParams.get('tag');
  if (!tag) return NextResponse.json({ error: 'tag query param required' }, { status: 400 });
  try {
    removeTag(ticker, tag);
    return new Response(null, { status: 204 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
