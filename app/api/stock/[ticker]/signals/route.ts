import { NextResponse } from 'next/server';
import {
  latestFdaForTicker,
  latestDodForTicker,
  latestArkForTicker,
  latestEdgarAlertForTicker,
  wikiPageviewsTrend,
  latestHiringForTicker,
  hiringTrendForTicker,
} from '@/lib/db/queries/reads';

export async function GET(_req: Request, { params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  try {
    const fda = latestFdaForTicker(ticker);
    const dod = latestDodForTicker(ticker);
    const ark = latestArkForTicker(ticker);
    const edgar = latestEdgarAlertForTicker(ticker);
    const wiki = wikiPageviewsTrend(ticker);
    const hiringLatest = latestHiringForTicker(ticker);
    const hiringTrend = hiringTrendForTicker(ticker);
    const hiring = hiringTrend
      ? {
          latest: hiringTrend.latest,
          prior7: hiringTrend.prior7,
          deltaPct: hiringTrend.deltaPct,
          ats: hiringTrend.ats,
        }
      : hiringLatest
      ? { latest: hiringLatest.open_jobs, prior7: null, deltaPct: null, ats: hiringLatest.ats }
      : null;
    return NextResponse.json({ fda, dod, ark, edgar, wiki, hiring });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
