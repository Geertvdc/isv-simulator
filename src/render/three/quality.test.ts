import { describe, expect, it } from 'vitest';
import {
  createFrameWatch,
  startQuality,
  pixelRatioFor,
  rewarm,
  stepDown,
  watchFrame,
} from './quality';

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

  it('steps down after a window of slow frames', () => {
    const w = createFrameWatch();
    run(w, 120, 16);
    expect(run(w, 90, 40)).toBe(1);
  });

  it('warms up again after a step, so the new quality gets judged fresh', () => {
    const w = createFrameWatch();
    run(w, 120, 16);
    run(w, 90, 40);
    rewarm(w);
    expect(run(w, 120, 40)).toBe(0);
    expect(run(w, 90, 40)).toBe(1);
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
    expect(startQuality('auto', 'low')).toEqual({ quality: 'low', watch: false });
    expect(startQuality('auto', 'medium').watch).toBe(false);
    expect(startQuality('auto', null)).toEqual({ quality: 'high', watch: true });
    const w = createFrameWatch(false);
    run(w, 120, 16);
    expect(run(w, 500, 100)).toBe(0);
  });

  it('takes the Graphics setting unless ?quality= overrides it', () => {
    expect(startQuality('low', null)).toEqual({ quality: 'low', watch: false });
    expect(startQuality('medium', 'high')).toEqual({ quality: 'high', watch: false });
    expect(startQuality('auto', 'ultra')).toEqual({ quality: 'high', watch: true });
  });
});

describe('quality steps', () => {
  it('goes high, medium, low and stops', () => {
    expect(stepDown('high')).toBe('medium');
    expect(stepDown('medium')).toBe('low');
    expect(stepDown('low')).toBeNull();
  });

  it('caps the pixel ratio on big screens and only uses it on high', () => {
    expect(pixelRatioFor('high', 2, 1440, 810)).toBe(1.5);
    expect(pixelRatioFor('high', 2, 3840, 2160)).toBe(1);
    expect(pixelRatioFor('high', 1, 1440, 810)).toBe(1);
    expect(pixelRatioFor('medium', 2, 1440, 810)).toBe(1);
  });
});
