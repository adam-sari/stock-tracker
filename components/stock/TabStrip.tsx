'use client';

import { useRouter, useSearchParams } from 'next/navigation';

const TABS = [
  { id: 'activity', label: 'Activity' },
  { id: 'news', label: 'News' },
  { id: 'insiders', label: 'Insiders' },
  { id: 'funds', label: 'Funds (13F)' },
  { id: 'congress', label: 'Congress' },
  { id: 'sentiment', label: 'Sentiment' },
  { id: 'backtest', label: 'Backtest' },
  { id: 'research', label: '✦ Research' },
  { id: 'about', label: 'About' },
] as const;

export type TabId = (typeof TABS)[number]['id'];

export function TabStrip({ active, onChange }: { active: TabId; onChange: (id: TabId) => void }) {
  return (
    <nav className="flex gap-1 border-b border-border overflow-x-auto">
      {TABS.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`px-3 py-2 text-sm border-b-2 transition-colors ${
            active === t.id ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-text'
          }`}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}

export const TAB_IDS = TABS.map(t => t.id);
