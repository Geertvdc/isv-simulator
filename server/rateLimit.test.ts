import { describe, expect, it } from 'vitest';
import { RateLimiter } from './rateLimit';

const limit = { burst: 3, refillMs: 1000 };

describe('RateLimiter', () => {
  it('lets a burst through, then refuses until a token comes back', () => {
    const limiter = new RateLimiter(limit);
    expect([1, 2, 3, 4].map(() => limiter.tryTake('a', 0))).toEqual([true, true, true, false]);
    expect(limiter.tryTake('a', 999)).toBe(false);
    expect(limiter.tryTake('a', 1000)).toBe(true);
    expect(limiter.tryTake('a', 1000)).toBe(false);
  });

  it('keeps keys apart', () => {
    const limiter = new RateLimiter({ burst: 1, refillMs: 1000 });
    expect(limiter.tryTake('a', 0)).toBe(true);
    expect(limiter.tryTake('a', 0)).toBe(false);
    expect(limiter.tryTake('b', 0)).toBe(true);
  });

  it('refills one token per interval, keeping the leftover time, up to the burst', () => {
    const limiter = new RateLimiter(limit);
    for (let i = 0; i < 3; i++) limiter.tryTake('a', 0);
    expect(limiter.tokens('a', 1500)).toBe(1);
    expect(limiter.tryTake('a', 1500)).toBe(true);
    // The half interval since the last token still counts.
    expect(limiter.tokens('a', 2000)).toBe(1);
    expect(limiter.tokens('a', 60_000)).toBe(3);
  });

  it('counts failures with take without going below zero, and allows does not take', () => {
    const limiter = new RateLimiter(limit);
    for (let i = 0; i < 5; i++) limiter.take('a', 0);
    expect(limiter.tokens('a', 0)).toBe(0);
    expect(limiter.allows('a', 0)).toBe(false);
    expect(limiter.allows('a', 1000)).toBe(true);
    expect(limiter.allows('a', 1000)).toBe(true);
    expect(limiter.tokens('a', 1000)).toBe(1);
  });

  it('ignores time going backwards', () => {
    const limiter = new RateLimiter(limit);
    for (let i = 0; i < 3; i++) limiter.tryTake('a', 5000);
    expect(limiter.tryTake('a', 0)).toBe(false);
  });

  it('forgets keys that are full again once there are too many', () => {
    const limiter = new RateLimiter({ burst: 1, refillMs: 1000 }, 2);
    limiter.tryTake('a', 0);
    limiter.tryTake('b', 0);
    expect(limiter.size).toBe(2);
    limiter.tryTake('c', 5000);
    expect(limiter.size).toBe(1);
    expect(limiter.tryTake('a', 5000)).toBe(true);
  });
});
