export class TokenBucketLimiter {
  private readonly limitPerMinute: number;
  private readonly state = new Map<string, { tokens: number; last: number }>();

  constructor(limitPerMinute: number) {
    this.limitPerMinute = Math.max(1, limitPerMinute);
  }

  allow(key: string): boolean {
    const now = Date.now();
    const item = this.state.get(key) ?? { tokens: this.limitPerMinute, last: now };
    const elapsedMinutes = (now - item.last) / 60_000;
    const refill = elapsedMinutes * this.limitPerMinute;
    item.tokens = Math.min(this.limitPerMinute, item.tokens + refill);
    item.last = now;

    if (item.tokens < 1) {
      this.state.set(key, item);
      return false;
    }

    item.tokens -= 1;
    this.state.set(key, item);
    return true;
  }
}

export class CompositeRateLimiter {
  private readonly perClient: TokenBucketLimiter;
  private readonly global: TokenBucketLimiter;

  constructor(perClientPerMinute: number, globalPerMinute: number) {
    this.perClient = new TokenBucketLimiter(perClientPerMinute);
    this.global = new TokenBucketLimiter(globalPerMinute);
  }

  allow(clientKey: string): boolean {
    if (!this.global.allow("__global__")) {
      return false;
    }
    return this.perClient.allow(clientKey);
  }
}
