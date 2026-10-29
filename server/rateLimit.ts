/**
 * A token bucket per key (a client IP): each key holds up to `burst` tokens
 * and gains one every `refillMs`. Deterministic: every call takes `now` (ms)
 * from the caller. Keys whose bucket is full again are forgotten once there
 * are more than `maxKeys`, so memory stays bounded.
 */

export interface RateLimit {
  /** Tokens a fresh key starts with, and the most it can hold. */
  burst: number;
  /** One token comes back after this long. */
  refillMs: number;
}

interface Bucket {
  tokens: number;
  at: number;
}

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    readonly limit: RateLimit,
    private readonly maxKeys = 10_000,
  ) {}

  /** Tokens `key` has at `now`. */
  tokens(key: string, now: number): number {
    return this.refilled(key, now).tokens;
  }

  /** Whether `key` has a token left at `now`, without taking it. */
  allows(key: string, now: number): boolean {
    return this.tokens(key, now) >= 1;
  }

  /** Takes a token when there is one; answers whether there was. */
  tryTake(key: string, now: number): boolean {
    const bucket = this.refilled(key, now);
    if (bucket.tokens < 1) return false;
    this.store(key, { tokens: bucket.tokens - 1, at: bucket.at }, now);
    return true;
  }

  /** Takes a token whether or not there is one (not below zero): for counting failures. */
  take(key: string, now: number): void {
    const bucket = this.refilled(key, now);
    this.store(key, { tokens: Math.max(0, bucket.tokens - 1), at: bucket.at }, now);
  }

  /** How many keys are tracked (for tests). */
  get size(): number {
    return this.buckets.size;
  }

  private refilled(key: string, now: number): Bucket {
    const { burst, refillMs } = this.limit;
    const bucket = this.buckets.get(key);
    if (!bucket) return { tokens: burst, at: now };
    if (now <= bucket.at) return bucket;
    const gained = Math.floor((now - bucket.at) / refillMs);
    if (gained === 0) return bucket;
    const tokens = Math.min(burst, bucket.tokens + gained);
    // Keep the leftover time towards the next token, unless the bucket is full.
    const at = tokens === burst ? now : bucket.at + gained * refillMs;
    return { tokens, at };
  }

  private store(key: string, bucket: Bucket, now: number): void {
    this.buckets.set(key, bucket);
    if (this.buckets.size > this.maxKeys) this.prune(now);
  }

  /** Forgets keys that are full again at `now` (a fresh key starts full anyway). */
  private prune(now: number): void {
    for (const key of [...this.buckets.keys()]) {
      if (this.refilled(key, now).tokens >= this.limit.burst) this.buckets.delete(key);
    }
  }
}
