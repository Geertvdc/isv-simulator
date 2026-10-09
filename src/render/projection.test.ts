import { describe, expect, it } from 'vitest';
import {
  VIEW_YAW,
  blockFaces,
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

    it('shows the front face and one side, never the back', () => {
      const sides = faces.sides.map((f) => f.side);
      expect(sides).toContain('front');
      expect(sides).not.toContain('back');
      expect(sides).toContain(VIEW_YAW > 0 ? 'right' : 'left');
      expect(sides).toHaveLength(2);
    });
  });
});
