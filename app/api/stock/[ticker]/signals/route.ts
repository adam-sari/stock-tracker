import { NextResponse } from 'next/server';
import {
  latestFdaForTicker,
  latestDodForTicker,
  latestArkForTicker,
  latestEdgarAlertForTicker,
  wikiPageviewsTrend,
} from '@/lib/db/queries/reads';

export async function GET(_req: Request, { params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  try {
    const fda = latestFdaForTicker(ticker);
    const dod = latestDodForTicker(ticker);
    const ark = latestArkForTicker(ticker);
    const edgar = latestEdgarAlertForTicker(ticker);
    const wiki = wikiPageviewsTrend(ticker);
    return NextResponse.json({ fda, dod, ark, edgar, wiki });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
