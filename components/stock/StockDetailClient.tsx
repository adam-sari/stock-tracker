'use client';

import { useEffect, useState } from 'react';
import { Chart } from '@/components/Chart';
import { StockHeader } from './StockHeader';
import { PositionPanel } from './PositionPanel';
import { AboutPanel } from './AboutPanel';
import { TabStrip, type TabId } from './TabStrip';
import { ActivityTab } from './ActivityTab';
import { NewsTab } from './NewsTab';
import { InsidersTab } from './InsidersTab';
import { FundsTab } from './FundsTab';
import { CongressTab } from './CongressTab';
import { SentimentTab } from './SentimentTab';
import { BacktestTab } from './BacktestTab';
import { SignalsPanel } from './SignalsPanel';
import type { Bar, Quote } from '@/lib/providers/types';

type Props = {
  ticker: string;
  initialMeta: { name: string; description?: string; industry?: string; sector?: string; exchange?: string; market_cap?: number; ipo_date?: string; weburl?: string; logo_url?: string; ceo?: string; employees?: number } | null;
  initialQuote: Quote | null;
  initialBars: Bar[];
  initialTags: string[];
  position: { qty: number; avgCost: number };
};

const RANGES = [
  { label: '1D', range: '1d', interval: '1m' as const },
  { label: '5D', range: '5d', interval: '1m' as const },
  { label: '1M', range: '1mo', interval: '1d' as const },
  { label: '3M', range: '3mo', interval: '1d' as const },
  { label: 'YTD', range: 'ytd', interval: '1d' as const },
  { label: '1Y', range: '1y', interval: '1d' as const },
  { label: 'ALL', range: 'max', interval: '1d' as const },
];

export function StockDetailClient(props: Props) {
  const { ticker, initialMeta, initialQuote, initialBars, initialTags, position } = props;
  const [activeTab, setActiveTab] = useState<TabId>('activity');
  const [quote, setQuote] = useState(initialQuote);
  const [bars, setBars] = useState<Bar[]>(initialBars);
  const [rangeIdx, setRangeIdx] = useState(0);

  // Live price polling every 30s
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const r = await fetch(`/api/prices/${ticker}/latest`);
        if (r.ok) setQuote(await r.json());
      } catch { /* ignore */ }
    }, 30_000);
    return () => clearInterval(id);
  }, [ticker]);

  // Bars fetch on range change
  useEffect(() => {
    const controller = new AbortController();
    const r = RANGES[rangeIdx];
    fetch(`/api/prices/${ticker}/bars?interval=${r.interval}&range=${r.range}&prepost=true`, { signal: controller.signal })
      .then(res => res.json())
      .then(data => { if (Array.isArray(data)) setBars(data); })
      .catch(e => { if (e.name !== 'AbortError') setBars([]); });
    return () => controller.abort();
  }, [ticker, rangeIdx]);

  return (
    <main className="p-6 max-w-6xl mx-auto flex flex-col gap-6">
      <StockHeader
        ticker={ticker}
        name={initialMeta?.name ?? ticker}
        price={quote?.price ?? null}
        change={null}
        changePct={null}
        postPrice={null}
        initialTags={initialTags}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
        <section>
          <div className="flex items-center gap-3 mb-2">
            <div className="flex gap-1 ml-auto">
              {RANGES.map((r, i) => (
                <button key={r.label} onClick={() => setRangeIdx(i)}
                  className={`text-xs px-2 py-0.5 rounded border ${i === rangeIdx ? 'bg-accent text-bg border-accent' : 'border-border text-muted hover:text-text'}`}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <Chart bars={bars} height={360} showSessions={RANGES[rangeIdx].interval === '1m'} />
        </section>
        <PositionPanel ticker={ticker} qty={position.qty} avgCost={position.avgCost} currentPrice={quote?.price ?? null} />
      </div>

      <SignalsPanel ticker={ticker} />

      <TabStrip active={activeTab} onChange={setActiveTab} />

      <section>
        {activeTab === 'activity' && <ActivityTab ticker={ticker} />}
        {activeTab === 'news' && <NewsTab ticker={ticker} />}
        {activeTab === 'insiders' && <InsidersTab ticker={ticker} />}
        {activeTab === 'funds' && <FundsTab ticker={ticker} />}
        {activeTab === 'congress' && <CongressTab ticker={ticker} />}
        {activeTab === 'sentiment' && <SentimentTab ticker={ticker} />}
        {activeTab === 'backtest' && <BacktestTab ticker={ticker} />}
        {activeTab === 'about' && <AboutPanel meta={initialMeta as any} />}
      </section>
    </main>
  );
}
