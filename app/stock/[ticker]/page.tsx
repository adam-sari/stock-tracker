import { notFound } from 'next/navigation';
import { applySchema } from '@/lib/db/migrate';
import { quoteChain, minuteBarsChain } from '@/lib/providers';
import { listHoldings } from '@/lib/db/queries/holdings';
import { getStockMeta } from '@/lib/db/queries/stock-meta';
import { listTagsForTicker } from '@/lib/db/queries/tags';
import { StockDetailClient } from '@/components/stock/StockDetailClient';

applySchema();

export const dynamic = 'force-dynamic';

export default async function StockDetail({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  const upper = ticker.toUpperCase();
  if (!/^[A-Z]{1,6}(\.[A-Z]{1,2})?$/.test(upper)) notFound();

  const [quote, meta] = await Promise.all([
    quoteChain().getLatestQuote(upper).catch(() => null),
    Promise.resolve(getStockMeta(upper)),
  ]);

  const now = new Date();
  const start = new Date(now.getTime() - 86400_000);
  const initialBars = await minuteBarsChain().getMinuteBars(upper, { start, end: now, prepost: true }).catch(() => []);

  const tags = listTagsForTicker(upper);

  const holdings = listHoldings();
  const h = holdings.find(x => x.ticker === upper);
  const position = h ? { qty: h.qty, avgCost: h.avg_cost } : { qty: 0, avgCost: 0 };

  return (
    <StockDetailClient
      ticker={upper}
      initialMeta={meta}
      initialQuote={quote}
      initialBars={initialBars}
      initialTags={tags}
      position={position}
    />
  );
}
