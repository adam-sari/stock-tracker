import { NextResponse } from 'next/server';
import { deleteTransaction } from '@/lib/db/queries/transactions';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Number(null) === 0 and Number.isInteger(0) is true — reject explicitly.
  // Also reject empty strings, decimals, and non-positive values.
  if (id == null || id === '' || !/^[1-9]\d*$/.test(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  const numId = Number(id);
  const ok = deleteTransaction(numId);
  return ok ? new Response(null, { status: 204 }) : NextResponse.json({ error: 'not found' }, { status: 404 });
}
