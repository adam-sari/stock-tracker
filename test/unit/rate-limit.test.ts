import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TokenBucket } from '@/lib/rate-limit';

describe('TokenBucket', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('lets through requests up to capacity immediately', async () => {
    const bucket = new TokenBucket({ capacity: 3, refillPerMs: 1 / 1000 });
    const t0 = Date.now();
    await bucket.acquire();
    await bucket.acquire();
    await bucket.acquire();
    expect(Date.now() - t0).toBe(0);
  });

  it('blocks the next request until refill', async () => {
    const bucket = new TokenBucket({ capacity: 2, refillPerMs: 1 / 100 });
    await bucket.acquire();
    await bucket.acquire();
    const p = bucket.acquire();
    vi.advanceTimersByTime(50);
    let resolved = false;
    p.then(() => { resolved = true; });
    await Promise.resolve();
    expect(resolved).toBe(false);
    vi.advanceTimersByTime(60);
    await p;
    expect(resolved).toBe(true);
  });

  it('refills up to capacity', async () => {
    const bucket = new TokenBucket({ capacity: 3, refillPerMs: 1 / 100 });
    await bucket.acquire();
    await bucket.acquire();
    await bucket.acquire();
    vi.advanceTimersByTime(10_000);
    const t0 = Date.now();
    await bucket.acquire();
    await bucket.acquire();
    await bucket.acquire();
    expect(Date.now() - t0).toBe(0);
  });
});
