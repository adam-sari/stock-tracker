import { applySchema } from '@/lib/db/migrate';
import { listDiscoveryTopN } from '@/lib/db/queries/discovery';
import { DiscoveryClient } from '@/components/discover/DiscoveryClient';

applySchema();

export const dynamic = 'force-dynamic';

export default async function DiscoverPage() {
  const rows = listDiscoveryTopN(50);
  const items = rows.map(r => ({
    ticker: r.ticker,
    score: r.score,
    signals: JSON.parse(r.signals_json),
    computed_at: r.computed_at,
  }));
  return <DiscoveryClient initial={items} />;
}
