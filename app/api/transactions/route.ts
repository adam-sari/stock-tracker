import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createTransaction, listTransactions } from '@/lib/db/queries/transactions';

const inputSchema = z.object({
  ticker: z.string().min(1).max(10),
  kind: z.enum(['buy', 'sell']),
  qty: z.number().positive(),
  price: z.number().nonnegative(),
  fees: z.number().nonnegative().optional(),
  executed_at: z.string().datetime(),
  note: z.string().optional(),
});

export async function GET() {
  return NextResponse.json(listTransactions());
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  try {
    const t = createTransaction(parsed.data);
    return NextResponse.json(t, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
