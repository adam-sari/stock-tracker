import { listHoldings } from '@/lib/db/queries/holdings';
import { computePortfolioValue } from '@/lib/computations/portfolio';
import { quoteChain } from '@/lib/providers';
import { applySchema } from '@/lib/db/migrate';
import { DashboardClient } from './dashboard-client';

applySchema();

export const dynamic = 'force-dynamic';

export default async function Page() {
  const holdings = listHoldings();
  const quotes = new Map<string, number>();
  await Promise.all(
    holdings.map(async h => {
      const q = await quoteChain().getLatestQuote(h.ticker);
      if (q) quotes.set(h.ticker, q.price);
    })
  );
  const initialValue = computePortfolioValue(holdings, quotes);
  const tagsMap = (await import('@/lib/db/queries/tags')).listTagsByTickerMap();
  const tagsByTicker: Record<string, string[]> = Object.fromEntries(tagsMap);
  return <DashboardClient initialValue={initialValue} initialTags={tagsByTicker} />;
}
