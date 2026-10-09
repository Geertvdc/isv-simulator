import { describe, expect, it } from 'vitest';
import {
  type Rotation,
  TILE_H,
  TILE_W,
  diamondPoints,
  rotate,
  screenToTile,
  screenToTileFloat,
  tileDepth,
  tileToScreen,
} from './iso';

/** Small step that stays well above float noise at these magnitudes. */
const EPS = 0.01;
const ROTATIONS: Rotation[] = [0, 1, 2, 3];

describe('iso', () => {
  it('places tile (0, 0) at the origin and steps by half a tile', () => {
    expect(tileToScreen(0, 0)).toEqual({ x: 0, y: 0 });
    expect(tileToScreen(1, 0)).toEqual({ x: TILE_W / 2, y: TILE_H / 2 });
    expect(tileToScreen(0, 1)).toEqual({ x: -TILE_W / 2, y: TILE_H / 2 });
  });

  it('turns the map a quarter clockwise per rotation step', () => {
    // +x points bottom right, then bottom left, top left, top right.
    expect(tileToScreen(1, 0, 1)).toEqual({ x: -TILE_W / 2, y: TILE_H / 2 });
    expect(tileToScreen(1, 0, 2)).toEqual({ x: -TILE_W / 2, y: -TILE_H / 2 });
    expect(tileToScreen(1, 0, 3)).toEqual({ x: TILE_W / 2, y: -TILE_H / 2 });
  });

  it('wraps rotation in both directions', () => {
    expect(rotate(3, 1)).toBe(0);
    expect(rotate(0, -1)).toBe(3);
    expect(rotate(2, 6)).toBe(0);
  });

  describe.each(ROTATIONS)('rotation %i', (rotation) => {
    it('round-trips tileToScreen through screenToTile', () => {
      for (let y = -5; y <= 20; y++) {
        for (let x = -5; x <= 20; x++) {
          const s = tileToScreen(x, y, rotation);
          expect(screenToTile(s.x, s.y, rotation)).toEqual({ x, y });
        }
      }
    });

    it('round-trips fractional tiles through screenToTileFloat', () => {
      const s = tileToScreen(2.25, 7.5, rotation);
      const f = screenToTileFloat(s.x, s.y, rotation);
      expect(f.x).toBeCloseTo(2.25);
      expect(f.y).toBeCloseTo(7.5);
    });

    it('gives deeper depth to tiles lower on screen', () => {
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 14; x++) {
          expect(tileDepth(x, y, rotation) * (TILE_H / 2)).toBeCloseTo(
            tileToScreen(x, y, rotation).y,
          );
        }
      }
    });

    describe('near diamond edges', () => {
      const tiles = [
        { x: 0, y: 0 },
        { x: 3, y: 7 },
        { x: 13, y: 0 },
      ];

      it('picks the tile just inside each corner', () => {
        for (const t of tiles) {
          const [top, right, bottom, left] = diamondPoints(t.x, t.y, rotation);
          expect(screenToTile(top.x, top.y + EPS, rotation)).toEqual(t);
          expect(screenToTile(right.x - EPS, right.y, rotation)).toEqual(t);
          expect(screenToTile(bottom.x, bottom.y - EPS, rotation)).toEqual(t);
          expect(screenToTile(left.x + EPS, left.y, rotation)).toEqual(t);
        }
      });

      it('picks the tile or its neighbour on either side of each edge midpoint', () => {
        for (const t of tiles) {
          const [top, right, bottom, left] = diamondPoints(t.x, t.y, rotation);
          const c = tileToScreen(t.x, t.y, rotation);
          const neighbours = [
            { x: t.x + 1, y: t.y },
            { x: t.x - 1, y: t.y },
            { x: t.x, y: t.y + 1 },
            { x: t.x, y: t.y - 1 },
          ];
          for (const [a, b] of [
            [top, right],
            [right, bottom],
            [bottom, left],
            [left, top],
          ] as const) {
            const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
            // Unit vector from the tile center outward through the edge midpoint.
            const len = Math.hypot(mid.x - c.x, mid.y - c.y);
            const out = { x: (mid.x - c.x) / len, y: (mid.y - c.y) / len };
            // The neighbour across this edge is the one whose center lies that way.
            const across = { x: c.x + out.x * len * 2, y: c.y + out.y * len * 2 };
            const neighbour = neighbours.find((n) => {
              const s = tileToScreen(n.x, n.y, rotation);
              return Math.abs(s.x - across.x) < EPS && Math.abs(s.y - across.y) < EPS;
            });
            expect(neighbour).toBeDefined();
            expect(screenToTile(mid.x - out.x * EPS, mid.y - out.y * EPS, rotation)).toEqual(t);
            expect(screenToTile(mid.x + out.x * EPS, mid.y + out.y * EPS, rotation)).toEqual(
              neighbour,
            );
          }
        }
      });
    });
  });
});
