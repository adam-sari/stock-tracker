import { describe, it, expect } from 'vitest';
import { composeFromHistory } from '@/lib/computations/composite-from-history';
import { DEFAULT_WEIGHTS } from '@/lib/computations/discovery';

describe('composeFromHistory', () => {
  it('returns weighted-sum-of-raw-scores per date (matches aggregateScores formula)', () => {
    const rows = [
      { date: '2026-05-21', ticker: 'AAPL', signal_kind: 'insider', score: 0.8, detail_json: '{}' },
      { date: '2026-05-21', ticker: 'AAPL', signal_kind: 'volume', score: 0.4, detail_json: '{}' },
      { date: '2026-05-20', ticker: 'AAPL', signal_kind: 'insider', score: 0.5, detail_json: '{}' },
    ];
    const out = composeFromHistory(rows, DEFAULT_WEIGHTS);
    const totalW = Object.values(DEFAULT_WEIGHTS).reduce((s, w) => s + w, 0);
    const expected21 = (0.8 * DEFAULT_WEIGHTS.insider + 0.4 * DEFAULT_WEIGHTS.volume) / totalW;
    const expected20 = (0.5 * DEFAULT_WEIGHTS.insider) / totalW;
    const p21 = out.find(p => p.date === '2026-05-21')!;
    const p20 = out.find(p => p.date === '2026-05-20')!;
    expect(p21.compositeScore).toBeCloseTo(expected21, 6);
    expect(p20.compositeScore).toBeCloseTo(expected20, 6);
  });

  it('emits ASC order by date (for left-to-right sparkline rendering)', () => {
    const rows = [
      { date: '2026-05-21', ticker: 'AAPL', signal_kind: 'insider', score: 0.8, detail_json: '{}' },
      { date: '2026-05-20', ticker: 'AAPL', signal_kind: 'insider', score: 0.5, detail_json: '{}' },
    ];
    const out = composeFromHistory(rows, DEFAULT_WEIGHTS);
    expect(out.map(p => p.date)).toEqual(['2026-05-20', '2026-05-21']);
  });

  it('returns empty array for no rows', () => {
    expect(composeFromHistory([], DEFAULT_WEIGHTS)).toEqual([]);
  });
});
