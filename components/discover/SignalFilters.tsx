'use client';

const SIGNALS = [
  { id: 'insider', label: 'Insider clusters', color: 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300' },
  { id: 'congress', label: 'Congress buying', color: 'bg-purple-500/20 border-purple-500/30 text-purple-300' },
  { id: 'funds', label: '13F accumulation', color: 'bg-amber-500/20 border-amber-500/30 text-amber-300' },
  { id: 'halts', label: 'Trading halts', color: 'bg-red-500/20 border-red-500/30 text-red-300' },
];

type Props = {
  enabled: Set<string>;
  onToggle: (id: string) => void;
};

export function SignalFilters({ enabled, onToggle }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {SIGNALS.map(s => {
        const on = enabled.has(s.id);
        return (
          <button
            key={s.id}
            onClick={() => onToggle(s.id)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              on ? s.color : 'bg-bg border-border text-muted hover:text-text'
            }`}
          >
            {on ? '☑' : '☐'} {s.label}
          </button>
        );
      })}
    </div>
  );
}

export const ALL_SIGNALS = SIGNALS.map(s => s.id);
