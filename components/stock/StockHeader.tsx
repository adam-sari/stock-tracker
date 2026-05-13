import Link from 'next/link';
import { TagsEditor } from '@/components/TagsEditor';

type Props = {
  ticker: string;
  name: string;
  price: number | null;
  change: number | null;
  changePct: number | null;
  postPrice: number | null;
  initialTags: string[];
};

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const pct = (n: number) => `${(n * 100).toFixed(2)}%`;

export function StockHeader({ ticker, name, price, change, changePct, postPrice, initialTags }: Props) {
  const up = (change ?? 0) >= 0;
  return (
    <header className="flex items-start justify-between gap-4 flex-wrap">
      <div>
        <Link href="/" className="text-accent hover:underline text-sm">← Back</Link>
        <div className="flex items-baseline gap-3 mt-2">
          <h1 className="text-2xl font-semibold tracking-tight">{ticker}</h1>
          <span className="text-muted">{name}</span>
        </div>
        <div className="mt-1">
          <TagsEditor ticker={ticker} initialTags={initialTags} />
        </div>
      </div>
      <div className="text-right tabular-nums">
        {price !== null && (
          <>
            <div className="text-2xl font-semibold">{money(price)}</div>
            <div className={`text-sm ${up ? 'text-up' : 'text-down'}`}>
              {change !== null && (change >= 0 ? '+' : '') + money(change)}
              {changePct !== null && ` (${pct(changePct)})`}
            </div>
            {postPrice !== null && postPrice !== price && (
              <div className="text-xs text-muted">Post: {money(postPrice)}</div>
            )}
          </>
        )}
      </div>
    </header>
  );
}
