import { describe, expect, it } from 'vitest';
import { MAX_SIMULATED_LAG_MS } from '../sim/balance';
import { type LagClock, createLagLine, createLagRunner, deliveryTime, parseLag } from './lag';

describe('lag simulator', () => {
  it('reads lag and jitter from text, and ignores junk', () => {
    expect(parseLag('100', '20')).toEqual({ lagMs: 100, jitterMs: 20 });
    expect(parseLag('100', null)).toEqual({ lagMs: 100, jitterMs: 0 });
    expect(parseLag(null, '30')).toEqual({ lagMs: 0, jitterMs: 30 });
    expect(parseLag(null, undefined)).toBeNull();
    expect(parseLag('0', '0')).toBeNull();
    expect(parseLag('abc', '-5')).toBeNull();
    expect(parseLag('99999', '')).toEqual({ lagMs: MAX_SIMULATED_LAG_MS, jitterMs: 0 });
  });

  it('delays by the lag plus up to the jitter', () => {
    const line = createLagLine({ lagMs: 100, jitterMs: 20 }, 1);
    for (let now = 0; now < 10_000; now += 50) {
      const at = deliveryTime(line, now);
      expect(at).toBeGreaterThanOrEqual(now + 100);
      expect(at).toBeLessThanOrEqual(now + 120);
    }
  });

  it('keeps messages in order', () => {
    const line = createLagLine({ lagMs: 10, jitterMs: 200 }, 7);
    let last = -Infinity;
    let jittered = false;
    for (let now = 0; now < 1000; now++) {
      const at = deliveryTime(line, now);
      expect(at).toBeGreaterThanOrEqual(last);
      if (at > now + 10) jittered = true;
      last = at;
    }
    expect(jittered).toBe(true);
  });

  it('is the same for the same seed', () => {
    const times = (seed: number) => {
      const line = createLagLine({ lagMs: 0, jitterMs: 100 }, seed);
      return [0, 100, 200, 300].map((t) => deliveryTime(line, t));
    };
    expect(times(3)).toEqual(times(3));
    expect(times(3)).not.toEqual(times(4));
  });

  it('runs what it is handed after the lag, in order, with one timer at a time', () => {
    let now = 0;
    const timers: { at: number; fn: () => void }[] = [];
    const clock: LagClock = {
      now: () => now,
      setTimer: (fn, ms) => timers.push({ at: now + ms, fn }),
    };
    const ran: number[] = [];
    const later = createLagRunner({ lagMs: 50, jitterMs: 30 }, 5, clock);
    for (let i = 0; i < 20; i++) {
      later(() => ran.push(i));
      now += 0.3;
    }
    expect(timers).toHaveLength(1);
    expect(ran).toEqual([]);
    // Fire timers as a real clock would, a bit late at times.
    while (timers.length > 0) {
      const next = timers.shift();
      if (!next) break;
      now = Math.max(now, next.at + (ran.length % 3 === 0 ? 0 : 0.7));
      next.fn();
      expect(timers.length).toBeLessThanOrEqual(1);
    }
    expect(ran).toEqual(Array.from({ length: 20 }, (_, i) => i));
    expect(now).toBeGreaterThanOrEqual(50);
    expect(now).toBeLessThanOrEqual(6 + 80 + 1);
  });
});
