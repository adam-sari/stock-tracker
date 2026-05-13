export type TokenBucketOpts = {
  capacity: number;
  refillPerMs: number;
};

export class TokenBucket {
  private tokens: number;
  private lastRefillAt: number;

  constructor(private opts: TokenBucketOpts) {
    this.tokens = opts.capacity;
    this.lastRefillAt = Date.now();
  }

  private refill() {
    const now = Date.now();
    const elapsed = now - this.lastRefillAt;
    this.tokens = Math.min(this.opts.capacity, this.tokens + elapsed * this.opts.refillPerMs);
    this.lastRefillAt = now;
  }

  async acquire(): Promise<void> {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }
    const needed = 1 - this.tokens;
    const waitMs = Math.ceil(needed / this.opts.refillPerMs);
    return new Promise(resolve => {
      const tick = () => {
        this.refill();
        if (this.tokens >= 1) {
          this.tokens -= 1;
          resolve();
        } else {
          setTimeout(tick, Math.ceil((1 - this.tokens) / this.opts.refillPerMs));
        }
      };
      setTimeout(tick, waitMs);
    });
  }
}
