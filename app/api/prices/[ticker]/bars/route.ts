import { NextResponse } from 'next/server';
import { minuteBarsChain, dailyBarsChain } from '@/lib/providers';

export async function GET(req: Request, { params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  const url = new URL(req.url);
  const interval = url.searchParams.get('interval') ?? '1m';
  const range = url.searchParams.get('range') ?? '1d';
  const prepost = url.searchParams.get('prepost') === 'true';

  const end = new Date();
  const start = computeStart(end, range);

  if (interval === '1m') {
    const bars = await minuteBarsChain().getMinuteBars(ticker, { start, end, prepost });
    return NextResponse.json(bars);
  }
  if (interval === '1d') {
    const bars = await dailyBarsChain().getDailyBars(ticker, { start, end });
    return NextResponse.json(bars);
  }
  return NextResponse.json({ error: 'unsupported interval' }, { status: 400 });
}

function computeStart(end: Date, range: string): Date {
  const ms = end.getTime();
  const day = 86_400_000;
  switch (range) {
    case '1d':  return new Date(ms - day);
    case '5d':  return new Date(ms - 5 * day);
    case '1mo': return new Date(ms - 30 * day);
    case '3mo': return new Date(ms - 90 * day);
    case 'ytd': return new Date(`${end.getUTCFullYear()}-01-01T00:00:00Z`);
    case '1y':  return new Date(ms - 365 * day);
    case '5y':  return new Date(ms - 5 * 365 * day);
    case 'max': return new Date('2000-01-01T00:00:00Z');
    default:    return new Date(ms - day);
  }
}
