import { describe, it, expect } from 'vitest';
import { MockProvider } from '@/lib/providers/mock';

describe('MockProvider', () => {
  it('reports ok health', async () => {
    const p = new MockProvider();
    expect((await p.health()).status).toBe('ok');
  });

  it('returns a deterministic quote', async () => {
    const p = new MockProvider({ basePrices: { AAPL: 200 } });
    const q = await p.getLatestQuote('AAPL');
    expect(q).not.toBeNull();
    expect(q!.price).toBe(200);
    // Session depends on wall-clock; just assert it's one of the valid values
    expect(['regular', 'pre', 'post']).toContain(q!.session);
  });

  it('returns null for unknown ticker', async () => {
    const p = new MockProvider({ basePrices: { AAPL: 200 } });
    expect(await p.getLatestQuote('UNKNOWN')).toBeNull();
  });

  it('generates minute bars across the range', async () => {
    const p = new MockProvider({ basePrices: { AAPL: 100 } });
    const start = new Date('2026-05-13T13:30:00Z');
    const end = new Date('2026-05-13T14:00:00Z');
    const bars = await p.getMinuteBars('AAPL', { start, end, prepost: false });
    expect(bars.length).toBe(30);
    expect(bars[0].session).toBe('regular');
  });
});
