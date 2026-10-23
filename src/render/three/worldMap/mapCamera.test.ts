import { describe, expect, it } from 'vitest';
import { cameraTarget, glide } from './mapCamera';

const MAP = { width: 48, height: 12 };

describe('cameraTarget', () => {
  it('follows the flag along the road, held off the island ends', () => {
    expect(cameraTarget(MAP, { x: 20, y: 6 }).x).toBe(20);
    expect(cameraTarget(MAP, { x: 1, y: 6 }).x).toBeGreaterThan(1);
    expect(cameraTarget(MAP, { x: 47, y: 6 }).x).toBeLessThan(47);
  });

  it('only partly follows the road up and down', () => {
    const up = cameraTarget(MAP, { x: 20, y: 2 });
    const down = cameraTarget(MAP, { x: 20, y: 10 });
    expect(up.y).toBeLessThan(down.y);
    expect(down.y - up.y).toBeLessThan(8);
  });

  it('centers a map narrower than its margins', () => {
    expect(cameraTarget({ width: 6, height: 12 }, { x: 1, y: 6 }).x).toBe(3);
  });
});

describe('glide', () => {
  it('eases toward the target without passing it', () => {
    const from = { x: 0, y: 0 };
    const to = { x: 10, y: -10 };
    const step = glide(from, to, 16);
    expect(step.x).toBeGreaterThan(0);
    expect(step.x).toBeLessThan(10);
    expect(step.y).toBeLessThan(0);
    const far = glide(from, to, 10_000);
    expect(far.x).toBeCloseTo(10);
    expect(glide(from, to, 0)).toEqual(from);
  });
});
