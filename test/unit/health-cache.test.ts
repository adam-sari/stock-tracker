import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { healthCache } from '@/lib/cache/health-cache';

describe('healthCache', () => {
  beforeEach(() => {
    healthCache.reset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('get', () => {
    it('returns null when nothing has been cached', () => {
      expect(healthCache.get()).toBeNull();
    });

    it('returns the stored body immediately after set', () => {
      const body = { status: 'ok', checks: [] };
      healthCache.set(body);
      expect(healthCache.get()).toBe(body);
    });

    it('returns null after the 30-second TTL expires', () => {
      healthCache.set({ status: 'ok' });
      // Advance past the 30s TTL
      vi.advanceTimersByTime(30_001);
      expect(healthCache.get()).toBeNull();
    });

    it('returns the body when TTL has not yet expired', () => {
      const body = { status: 'ok' };
      healthCache.set(body);
      // Just under 30s — still valid
      vi.advanceTimersByTime(29_999);
      expect(healthCache.get()).toBe(body);
    });

    it('returns null at exactly the TTL boundary', () => {
      healthCache.set({ status: 'ok' });
      vi.advanceTimersByTime(30_000);
      // expiresAt === Date.now() → condition is Date.now() < expiresAt → false
      expect(healthCache.get()).toBeNull();
    });
  });

  describe('set', () => {
    it('overwrites a previous cache entry with the new body', () => {
      const first = { status: 'ok', ts: 1 };
      const second = { status: 'degraded', ts: 2 };
      healthCache.set(first);
      healthCache.set(second);
      expect(healthCache.get()).toBe(second);
    });

    it('resets the TTL on overwrite', () => {
      healthCache.set({ status: 'ok', ts: 1 });
      // Advance 20s
      vi.advanceTimersByTime(20_000);
      // Overwrite — TTL restarted
      const fresh = { status: 'ok', ts: 2 };
      healthCache.set(fresh);
      // Advance another 20s (40s since first write, but only 20s since second write)
      vi.advanceTimersByTime(20_000);
      expect(healthCache.get()).toBe(fresh);
    });
  });

  describe('reset', () => {
    it('clears a cached value', () => {
      healthCache.set({ status: 'ok' });
      healthCache.reset();
      expect(healthCache.get()).toBeNull();
    });

    it('is safe to call when cache is already empty', () => {
      expect(() => healthCache.reset()).not.toThrow();
      expect(healthCache.get()).toBeNull();
    });

    it('allows setting a new value after reset', () => {
      healthCache.set({ status: 'ok', first: true });
      healthCache.reset();
      const newBody = { status: 'ok', second: true };
      healthCache.set(newBody);
      expect(healthCache.get()).toBe(newBody);
    });
  });
});
