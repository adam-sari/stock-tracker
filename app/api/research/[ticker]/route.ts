import { applySchema } from '@/lib/db/migrate';
import { getDb } from '@/lib/db/connection';
import { generateResearchNote } from '@/lib/research/generator';
import { getCachedResearchNote } from '@/lib/db/queries/research';
import { buildTickerContext } from '@/lib/research/context-builder';
import { createHash } from 'node:crypto';
import type { Mode } from '@/lib/research/types';

applySchema();

const TICKER_RE = /^[A-Z]{1,6}(\.[A-Z]{1,2})?$/;

function parseMode(req: Request): Mode | null {
  const url = new URL(req.url);
  const mode = (url.searchParams.get('mode') ?? 'standard').toLowerCase();
  if (mode !== 'standard' && mode !== 'deep') return null;
  return mode as Mode;
}

export async function GET(req: Request,
  ctx: { params: Promise<{ ticker: string }> }): Promise<Response> {
  const { ticker } = await ctx.params;
  const t = ticker.toUpperCase();
  if (!TICKER_RE.test(t)) return new Response('Bad ticker', { status: 400 });
  const mode = parseMode(req);
  if (!mode) return new Response('Bad mode', { status: 400 });

  const db = getDb();
  const ctxBundle = buildTickerContext(t, db, mode);
  const hash = createHash('sha256').update(JSON.stringify(ctxBundle)).digest('hex');
  const cached = getCachedResearchNote(t, mode, hash);
  if (!cached) return new Response('Not cached', { status: 404 });
  return Response.json({ note: cached });
}

export async function POST(req: Request,
  ctx: { params: Promise<{ ticker: string }> }): Promise<Response> {
  const { ticker } = await ctx.params;
  const t = ticker.toUpperCase();
  if (!TICKER_RE.test(t)) return new Response('Bad ticker', { status: 400 });
  const mode = parseMode(req);
  if (!mode) return new Response('Bad mode', { status: 400 });
  const url = new URL(req.url);
  const force = url.searchParams.get('force') === 'true';

  try {
    const note = await generateResearchNote(t, mode, getDb(), { force });
    return Response.json({ note });
  } catch (e) {
    const msg = (e as Error).message;
    if (/budget/i.test(msg)) return new Response(msg, { status: 402 });
    return new Response(msg, { status: 500 });
  }
}
