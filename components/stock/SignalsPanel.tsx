'use client';

import { useEffect, useState } from 'react';
import { ForecastTermStructure } from './ForecastTermStructure';
import type { PredictionIntervalRow } from '@/lib/db/queries/conformal';

type FdaRow = { event_date: string; committee: string; description: string } | null;
type DodRow = { award_amount: number; action_date: string; recipient_name: string } | null;
type ArkRow = { fund: string; direction: string; shares: number; ts: string } | null;
type EdgarRow = { phrase: string; filing_date: string; filing_url: string } | null;
type WikiTrend = { recent7Avg: number; prior7Avg: number; deltaPct: number } | null;
type HiringSignal = { latest: number; prior7: number | null; deltaPct: number | null; ats: string } | null;

type Signals = {
  fda: FdaRow;
  dod: DodRow;
  ark: ArkRow;
  edgar: EdgarRow;
  wiki: WikiTrend;
  hiring: HiringSignal;
};

const fmt$ = (n: number) => {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n.toLocaleString()}`;
};

export function SignalsPanel({ ticker }: { ticker: string }) {
  const [signals, setSignals] = useState<Signals | null>(null);
  const [intervals, setIntervals] = useState<PredictionIntervalRow[]>([]);

  useEffect(() => {
    fetch(`/api/stock/${ticker}/signals`)
      .then(r => r.json())
      .then(d => setSignals(d))
      .catch(() => setSignals({ fda: null, dod: null, ark: null, edgar: null, wiki: null, hiring: null }));
  }, [ticker]);

  useEffect(() => {
    fetch(`/api/conformal/${ticker}`).then(r => r.json())
      .then(body => setIntervals(body.rows ?? []))
      .catch(() => setIntervals([]));
  }, [ticker]);

  const latest21 = intervals.find(r => r.horizon_days === 21 && r.alpha === 0.10);

  if (!signals) return null;
  const { fda, dod, ark, edgar, wiki, hiring } = signals;
  if (!fda && !dod && !ark && !edgar && !wiki && !hiring) return null;

  return (
    <div className="flex flex-col gap-2">
    <div className="flex flex-wrap gap-3 text-xs">
      {fda && (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-cyan-500/10 text-cyan-300">
          💊 <span>FDA {fda.committee} · {fda.event_date}</span>
        </span>
      )}
      {dod && (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-blue-500/10 text-blue-300">
          🛡 <span>DOD {fmt$(dod.award_amount)} · {dod.action_date}</span>
        </span>
      )}
      {ark && (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-fuchsia-500/10 text-fuchsia-300">
          🚀 <span>ARK {ark.fund} {ark.direction} · {ark.ts}</span>
        </span>
      )}
      {edgar && (
        <a
          href={edgar.filing_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-orange-500/10 text-orange-300 hover:underline"
        >
          ⚠️ <span>EDGAR: {edgar.phrase} · {edgar.filing_date}</span>
        </a>
      )}
      {wiki && (
        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded ${wiki.deltaPct >= 0 ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>
          📖 <span>Wiki {wiki.deltaPct >= 0 ? '▲' : '▼'}{Math.abs(wiki.deltaPct).toFixed(1)}% 7-day views</span>
        </span>
      )}
      {hiring && (
        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded ${hiring.deltaPct !== null && hiring.deltaPct >= 0 ? 'bg-teal-500/10 text-teal-300' : hiring.deltaPct !== null ? 'bg-rose-500/10 text-rose-300' : 'bg-slate-500/10 text-slate-300'}`}>
          👔 <span>
            {hiring.deltaPct !== null
              ? `Hiring ${hiring.deltaPct >= 0 ? '▲' : '▼'}${Math.abs(hiring.deltaPct).toFixed(0)}% new jobs this week`
              : `Hiring ${hiring.latest} open jobs`}
            {' '}· {hiring.ats}
          </span>
        </span>
      )}
    </div>
    {latest21 && (
      <div className="flex items-baseline gap-2 text-xs">
        <span className="text-muted">
          21d alpha: {(latest21.point_pred * 100).toFixed(1)}%
          <span className="ml-1">
            [90% PI: {(latest21.lower * 100).toFixed(1)}%, {(latest21.upper * 100).toFixed(1)}%]
          </span>
        </span>
      </div>
    )}
    <ForecastTermStructure
      rows={intervals.filter(r => r.alpha === 0.10).map(r => ({
        horizon_days: r.horizon_days, point_pred: r.point_pred,
        lower: r.lower, upper: r.upper,
      }))}
      mode={latest21 ? 'pid' : 'cqr'}
    />
    </div>
  );
}
