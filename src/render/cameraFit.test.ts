import { describe, expect, it } from 'vitest';
import { type Insets, fitCamera } from './cameraFit';

const bounds = { left: -100, top: -50, right: 300, bottom: 150 }; // 400 x 200, center (100, 50)

function even(n: number): Insets {
  return { top: n, right: n, bottom: n, left: n };
}

describe('fitCamera', () => {
  it('centers on the middle of the bounds with even insets', () => {
    expect(fitCamera(bounds, { width: 800, height: 600 }, even(10)).center).toEqual({
      x: 100,
      y: 50,
    });
  });

  it('is limited by width in a tall viewport', () => {
    expect(fitCamera(bounds, { width: 800, height: 2000 }, even(0)).zoom).toBe(2);
  });

  it('is limited by height in a wide viewport', () => {
    expect(fitCamera(bounds, { width: 4000, height: 300 }, even(0)).zoom).toBe(1.5);
  });

  it('keeps the insets free', () => {
    const { zoom } = fitCamera(bounds, { width: 900, height: 2000 }, even(50));
    expect(zoom).toBe(2);
    expect(400 * zoom + 2 * 50).toBe(900);
  });

  it('centers the level in the space between uneven insets', () => {
    const viewport = { width: 1000, height: 700 };
    const insets = { top: 200, right: 0, bottom: 100, left: 0 };
    const { zoom, center } = fitCamera(bounds, viewport, insets);
    expect(zoom).toBe(2); // 400 tall free area / 200 world
    // The top of the level lands right below the top inset, the bottom right above the bottom one.
    const toScreenY = (wy: number) => viewport.height / 2 + (wy - center.y) * zoom;
    expect(toScreenY(bounds.top)).toBeCloseTo(200);
    expect(toScreenY(bounds.bottom)).toBeCloseTo(600);
  });

  it('never returns a zero or negative zoom when the insets eat the viewport', () => {
    expect(fitCamera(bounds, { width: 50, height: 50 }, even(100)).zoom).toBeGreaterThan(0);
  });
});
