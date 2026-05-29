import {
  getLatestPredictionIntervalsForTicker, getAllPidStates,
} from '@/lib/db/queries/conformal';

const TICKER_RE = /^[A-Z]{1,6}(\.[A-Z]{1,2})?$/;

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ ticker: string }> },
): Promise<Response> {
  const { ticker } = await ctx.params;
  const t = ticker.toUpperCase();
  if (!TICKER_RE.test(t)) return new Response('Bad ticker', { status: 400 });
  const rows = getLatestPredictionIntervalsForTicker(t);
  const states = getAllPidStates();
  return Response.json({ rows, states });
}
