import { describe, expect, it } from 'vitest';
import { fitCamera } from './cameraFit';

const bounds = { left: -100, top: -50, right: 300, bottom: 150 }; // 400 x 200, center (100, 50)

describe('fitCamera', () => {
  it('centers on the middle of the bounds', () => {
    expect(fitCamera(bounds, { width: 800, height: 600 }, 0).center).toEqual({ x: 100, y: 50 });
  });

  it('is limited by width in a tall viewport', () => {
    expect(fitCamera(bounds, { width: 800, height: 2000 }, 0).zoom).toBe(2);
  });

  it('is limited by height in a wide viewport', () => {
    expect(fitCamera(bounds, { width: 4000, height: 300 }, 0).zoom).toBe(1.5);
  });

  it('keeps the padding free on every side', () => {
    const { zoom } = fitCamera(bounds, { width: 900, height: 2000 }, 50);
    expect(zoom).toBe(2);
    expect(400 * zoom + 2 * 50).toBe(900);
  });

  it('never returns a zero or negative zoom when the padding eats the viewport', () => {
    expect(fitCamera(bounds, { width: 50, height: 50 }, 100).zoom).toBeGreaterThan(0);
  });
});
