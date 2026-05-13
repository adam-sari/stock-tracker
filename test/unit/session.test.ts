import { describe, it, expect } from 'vitest';
import { sessionFor } from '@/lib/providers/session';

describe('sessionFor', () => {
  it('tags a 14:00 UTC (10:00 ET) summer Wednesday as regular', () => {
    const ts = new Date('2026-07-15T14:00:00Z');
    expect(sessionFor(ts)).toBe('regular');
  });

  it('tags an 11:00 UTC (07:00 ET) summer Wednesday as pre', () => {
    const ts = new Date('2026-07-15T11:00:00Z');
    expect(sessionFor(ts)).toBe('pre');
  });

  it('tags a 21:00 UTC (17:00 ET) summer Wednesday as post', () => {
    const ts = new Date('2026-07-15T21:00:00Z');
    expect(sessionFor(ts)).toBe('post');
  });

  it('tags a 14:00 UTC (09:00 ET) winter Wednesday as pre (DST not active)', () => {
    const ts = new Date('2026-01-14T14:00:00Z');
    expect(sessionFor(ts)).toBe('pre');
  });

  it('tags a 15:00 UTC (10:00 ET) winter Wednesday as regular', () => {
    const ts = new Date('2026-01-14T15:00:00Z');
    expect(sessionFor(ts)).toBe('regular');
  });

  it('tags 04:00 ET (pre-market open) as pre, in both seasons', () => {
    expect(sessionFor(new Date('2026-07-15T08:00:00Z'))).toBe('pre');
    expect(sessionFor(new Date('2026-01-14T09:00:00Z'))).toBe('pre');
  });

  it('accepts an epoch-seconds number as input', () => {
    const epochS = Math.floor(new Date('2026-07-15T14:00:00Z').getTime() / 1000);
    expect(sessionFor(epochS)).toBe('regular');
  });
});
