import { describe, expect, it } from 'vitest';
import {
  type Box3,
  fitCamera3d,
  gridToWorld,
  pixelsPerUnit,
  projectPoint,
  projectedBounds,
  screenToGround,
  screenDirToGrid,
} from './projection';

/** Small step that stays well above float noise at these magnitudes. */
const EPS = 0.01;

describe('screenDirToGrid', () => {
  const dirs = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };

  it('maps the arrow directions onto the grid axes', () => {
    expect(screenDirToGrid(dirs.up)).toEqual({ x: 0, y: -1 });
    expect(screenDirToGrid(dirs.down)).toEqual({ x: 0, y: 1 });
    expect(screenDirToGrid(dirs.left)).toEqual({ x: -1, y: 0 });
    expect(screenDirToGrid(dirs.right)).toEqual({ x: 1, y: 0 });
  });

  it('normalises a diagonal', () => {
    const g = screenDirToGrid({ x: 3, y: -3 });
    expect(g.x).toBeCloseTo(Math.SQRT1_2);
    expect(g.y).toBeCloseTo(-Math.SQRT1_2);
  });

  it('keeps no input as no input', () => {
    expect(screenDirToGrid({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });
});

describe('3D projection', () => {
  const box: Box3 = { min: { x: -0.5, y: 0, z: -0.5 }, max: { x: 13.5, y: 1.2, z: 9.5 } };
  const insets = { top: 120, right: 32, bottom: 80, left: 32 };

  it('maps grid x to world x and grid y to world z', () => {
    expect(gridToWorld(3, 5, 0.5)).toEqual({ x: 3, y: 0.5, z: 5 });
  });

  it('keeps screen-up as grid-up: the camera has no yaw', () => {
    const pose = fitCamera3d(box, { width: 1280, height: 720 }, insets);
    // On the camera's center line; elsewhere perspective tilts grid lines a little.
    const a = projectPoint(pose, gridToWorld(6.5, 5));
    const up = projectPoint(pose, gridToWorld(6.5, 4));
    const right = projectPoint(pose, gridToWorld(7.5, 5));
    expect(up.y).toBeLessThan(a.y);
    expect(Math.abs(up.x - a.x)).toBeLessThan(EPS);
    expect(right.x).toBeGreaterThan(a.x);
    expect(Math.abs(right.y - a.y)).toBeLessThan(EPS);
    expect(screenDirToGrid({ x: 0, y: -1 })).toEqual({ x: 0, y: -1 });
  });

  it('round-trips the floor through projectPoint and screenToGround', () => {
    const pose = fitCamera3d(box, { width: 1280, height: 720 }, insets);
    for (const [x, y] of [
      [0, 0],
      [13, 9],
      [6.5, 3.25],
    ] as const) {
      const s = projectPoint(pose, gridToWorld(x, y));
      const g = screenToGround(pose, s.x, s.y);
      expect(g?.x).toBeCloseTo(x, 6);
      expect(g?.y).toBeCloseTo(y, 6);
    }
  });

  it('draws the back of the room smaller than the front', () => {
    const pose = fitCamera3d(box, { width: 1280, height: 720 }, insets);
    expect(pixelsPerUnit(pose, gridToWorld(6, 0))).toBeLessThan(
      pixelsPerUnit(pose, gridToWorld(6, 9)),
    );
  });

  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1024, height: 768 },
    { width: 3440, height: 1440 },
    { width: 390, height: 844 },
  ]) {
    it(`fits the level between the HUD bands at ${viewport.width}x${viewport.height}`, () => {
      const pose = fitCamera3d(box, viewport, insets);
      const b = projectedBounds(pose, box);
      const availW = viewport.width - insets.left - insets.right;
      const availH = viewport.height - insets.top - insets.bottom;
      expect(b.left).toBeGreaterThanOrEqual(insets.left - 0.5);
      expect(b.right).toBeLessThanOrEqual(viewport.width - insets.right + 0.5);
      expect(b.top).toBeGreaterThanOrEqual(insets.top - 0.5);
      expect(b.bottom).toBeLessThanOrEqual(viewport.height - insets.bottom + 0.5);
      // As large as it fits: one side touches.
      const fill = Math.max((b.right - b.left) / availW, (b.bottom - b.top) / availH);
      expect(fill).toBeGreaterThan(0.99);
      // Centered in the free space.
      expect((b.top + b.bottom) / 2).toBeCloseTo(insets.top + availH / 2, 0);
      expect((b.left + b.right) / 2).toBeCloseTo(insets.left + availW / 2, 0);
    });
  }
});
