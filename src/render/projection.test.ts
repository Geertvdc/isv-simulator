import { describe, expect, it } from 'vitest';
import {
  type Box3,
  VIEW_YAW,
  blockFaces,
  fitCamera3d,
  gridToWorld,
  pixelsPerUnit,
  projectPoint,
  projectedBounds,
  screenToGround,
  screenDirToGrid,
  screenToGrid,
  screenToTile,
  tileCorners,
  tileDepth,
  tileToScreen,
} from './projection';

/** Small step that stays well above float noise at these magnitudes. */
const EPS = 0.01;

describe('projection', () => {
  it('places tile (0, 0) at the origin', () => {
    expect(tileToScreen(0, 0)).toEqual({ x: 0, y: 0 });
  });

  it('runs +x to the right and +y down the screen', () => {
    const right = tileToScreen(1, 0);
    const down = tileToScreen(0, 1);
    expect(right.x).toBeGreaterThan(Math.abs(right.y));
    expect(down.y).toBeGreaterThan(Math.abs(down.x));
  });

  it('keeps the front edge almost horizontal', () => {
    const [, , frontRight, frontLeft] = tileCorners(0, 0);
    const angle = Math.atan2(frontRight.y - frontLeft.y, frontRight.x - frontLeft.x);
    expect(Math.abs(angle)).toBeLessThan((15 * Math.PI) / 180);
  });

  it('round-trips tileToScreen through screenToTile and screenToGrid', () => {
    for (let y = -5; y <= 20; y++) {
      for (let x = -5; x <= 20; x++) {
        const s = tileToScreen(x, y);
        expect(screenToTile(s.x, s.y)).toEqual({ x, y });
      }
    }
    const s = tileToScreen(2.25, 7.5);
    const g = screenToGrid(s.x, s.y);
    expect(g.x).toBeCloseTo(2.25);
    expect(g.y).toBeCloseTo(7.5);
  });

  it('picks the tile just inside each corner and its neighbour just outside', () => {
    for (const t of [
      { x: 0, y: 0 },
      { x: 3, y: 7 },
      { x: 11, y: 0 },
    ]) {
      const [bl, br, fr, fl] = tileCorners(t.x, t.y);
      const c = tileToScreen(t.x, t.y);
      for (const p of [bl, br, fr, fl]) {
        const inward = { x: c.x - p.x, y: c.y - p.y };
        const len = Math.hypot(inward.x, inward.y);
        expect(screenToTile(p.x + (inward.x / len) * EPS, p.y + (inward.y / len) * EPS)).toEqual(t);
      }
      // Just past the front edge midpoint is the tile in front.
      const front = { x: (fr.x + fl.x) / 2, y: (fr.y + fl.y) / 2 + EPS };
      expect(screenToTile(front.x, front.y)).toEqual({ x: t.x, y: t.y + 1 });
    }
  });

  it('gives deeper depth to tiles lower on screen', () => {
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 12; x++) {
        const s = tileToScreen(x, y);
        expect(tileDepth(x, y) / tileDepth(0, 1)).toBeCloseTo(s.y / tileToScreen(0, 1).y);
      }
    }
  });

  describe('blockFaces', () => {
    const faces = blockFaces(2, 3, 20);

    it('lifts the top face by the block height', () => {
      const base = tileCorners(2, 3);
      expect(faces.top).toEqual(base.map((p) => ({ x: p.x, y: p.y - 20 })));
    });

    it('shows the front face, a side only when the view is turned, never the back', () => {
      const sides = faces.sides.map((f) => f.side);
      expect(sides).toContain('front');
      expect(sides).not.toContain('back');
      if (VIEW_YAW === 0) {
        expect(sides).toEqual(['front']);
      } else {
        expect(sides).toContain(VIEW_YAW > 0 ? 'right' : 'left');
        expect(sides).toHaveLength(2);
      }
    });
  });

  describe('screenDirToGrid', () => {
    const dirs = {
      up: { x: 0, y: -1 },
      down: { x: 0, y: 1 },
      left: { x: -1, y: 0 },
      right: { x: 1, y: 0 },
      upRight: { x: Math.SQRT1_2, y: -Math.SQRT1_2 },
    };

    it.each(Object.entries(dirs))('walks %s on screen and has unit length', (_, dir) => {
      const g = screenDirToGrid(dir);
      expect(Math.hypot(g.x, g.y)).toBeCloseTo(1);
      const s = tileToScreen(g.x, g.y);
      const len = Math.hypot(s.x, s.y);
      expect(s.x / len).toBeCloseTo(dir.x);
      expect(s.y / len).toBeCloseTo(dir.y);
    });

    it('maps the arrow directions onto the grid axes when the view is not turned', () => {
      if (VIEW_YAW !== 0) return;
      expect(screenDirToGrid(dirs.up)).toEqual({ x: 0, y: -1 });
      expect(screenDirToGrid(dirs.down)).toEqual({ x: 0, y: 1 });
      expect(screenDirToGrid(dirs.left)).toEqual({ x: -1, y: 0 });
      expect(screenDirToGrid(dirs.right)).toEqual({ x: 1, y: 0 });
    });

    it('keeps no input as no input', () => {
      expect(screenDirToGrid({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
    });
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
