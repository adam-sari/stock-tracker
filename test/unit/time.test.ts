import { describe, it, expect } from 'vitest';
import { timeAgo, isoDate } from '@/lib/time';

describe('timeAgo', () => {
  it('returns "just now" within 60s', () => {
    expect(timeAgo(1000, 1059)).toBe('just now');
  });
  it('returns minutes', () => {
    expect(timeAgo(1000, 1000 + 120)).toBe('2m ago');
  });
  it('returns hours', () => {
    expect(timeAgo(1000, 1000 + 7200)).toBe('2h ago');
  });
  it('returns days', () => {
    expect(timeAgo(0, 3 * 86400)).toBe('3d ago');
  });
  it('returns months', () => {
    expect(timeAgo(0, 60 * 86400)).toBe('2mo ago');
  });
});

describe('isoDate', () => {
  it('formats as YYYY-MM-DD', () => {
    expect(isoDate(0)).toBe('1970-01-01');
    expect(isoDate(1700000000)).toBe('2023-11-14');
  });
});
