import { describe, expect, it } from 'vitest';
import { MAX_SIMULATED_LAG_MS } from '../sim/balance';
import { createLagLine, deliveryTime, parseLag } from './lag';

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
});
