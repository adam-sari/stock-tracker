import { NextResponse } from 'next/server';
import { deleteTransaction } from '@/lib/db/queries/transactions';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isInteger(numId)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  const ok = deleteTransaction(numId);
  return ok ? new Response(null, { status: 204 }) : NextResponse.json({ error: 'not found' }, { status: 404 });
}
