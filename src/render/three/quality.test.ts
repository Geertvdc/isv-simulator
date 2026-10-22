import { describe, expect, it } from 'vitest';
import { createFrameWatch, initialQuality, watchFrame } from './quality';

function run(w: ReturnType<typeof createFrameWatch>, frames: number, ms: number): number {
  let drops = 0;
  for (let i = 0; i < frames; i++) if (watchFrame(w, ms)) drops++;
  return drops;
}

describe('frame watch', () => {
  it('ignores slow frames while the game warms up', () => {
    const w = createFrameWatch();
    expect(run(w, 120, 50)).toBe(0);
  });

  it('drops the quality once after a window of slow frames, never again', () => {
    const w = createFrameWatch();
    run(w, 120, 16);
    expect(run(w, 90, 40)).toBe(1);
    expect(run(w, 1000, 40)).toBe(0);
  });

  it('keeps the quality when only a few frames hitch', () => {
    const w = createFrameWatch();
    run(w, 120, 16);
    let drops = 0;
    for (let i = 0; i < 900; i++) if (watchFrame(w, i % 3 === 0 ? 40 : 16)) drops++;
    expect(drops).toBe(0);
  });

  it('ignores long gaps like a hidden tab', () => {
    const w = createFrameWatch();
    run(w, 120, 16);
    expect(run(w, 500, 1000)).toBe(0);
  });

  it('does not watch when the quality was asked for', () => {
    expect(initialQuality('low')).toEqual({ quality: 'low', watch: false });
    expect(initialQuality('high').watch).toBe(false);
    expect(initialQuality(null)).toEqual({ quality: 'high', watch: true });
    const w = createFrameWatch(false);
    run(w, 120, 16);
    expect(run(w, 500, 100)).toBe(0);
  });
});
