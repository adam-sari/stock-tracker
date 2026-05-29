import { describe, it, expect } from 'vitest';
import { hashContext } from '@/lib/research/context-builder';
import type { TickerContext } from '@/lib/research/types';

const BASE: TickerContext = {
  ticker: 'TEST',
  built_at: '2026-05-29T00:00:00.000Z',
  meta: null,
  signals_last_90d: { insider: [], congress: [], funds_latest_quarter: [], volume_spikes: [], halts: [] },
  price_summary: { latest_close: 100, latest_date: '2026-05-22', high_1y: { value: 200, date: '2026-01-14' },
    low_1y: { value: 90, date: '2026-05-14' }, drawdown_from_high_pct: -50,
    returns: { '1d': 0, '5d': 0, '21d': 0, '63d': 0, '252d': null },
    cite: 'candles_daily:TEST|2026-05-22' },
  news_last_90d: [],
  backtest_summary: null,
};

describe('hashContext', () => {
  it('returns the same hash for contexts that differ only in built_at', () => {
    const a = hashContext({ ...BASE, built_at: '2026-05-29T00:00:00.000Z' });
    const b = hashContext({ ...BASE, built_at: '2026-05-29T12:34:56.000Z' });
    expect(a).toBe(b);
  });

  it('returns a different hash when underlying signals change', () => {
    const a = hashContext(BASE);
    const b = hashContext({ ...BASE, price_summary: { ...BASE.price_summary!, latest_close: 999 } });
    expect(a).not.toBe(b);
  });
});
