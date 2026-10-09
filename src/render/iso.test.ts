import { describe, expect, it } from 'vitest';
import { TILE_H, TILE_W, diamondPoints, screenToTile, tileToScreen } from './iso';

/** Small step that stays well above float noise at these magnitudes. */
const EPS = 0.01;

describe('iso', () => {
  it('places tile (0, 0) at the origin and steps by half a tile', () => {
    expect(tileToScreen(0, 0)).toEqual({ x: 0, y: 0 });
    expect(tileToScreen(1, 0)).toEqual({ x: TILE_W / 2, y: TILE_H / 2 });
    expect(tileToScreen(0, 1)).toEqual({ x: -TILE_W / 2, y: TILE_H / 2 });
  });

  it('round-trips tileToScreen through screenToTile', () => {
    for (let y = -5; y <= 20; y++) {
      for (let x = -5; x <= 20; x++) {
        const s = tileToScreen(x, y);
        expect(screenToTile(s.x, s.y)).toEqual({ x, y });
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
        const [top, right, bottom, left] = diamondPoints(t.x, t.y);
        expect(screenToTile(top.x, top.y + EPS)).toEqual(t);
        expect(screenToTile(right.x - EPS, right.y)).toEqual(t);
        expect(screenToTile(bottom.x, bottom.y - EPS)).toEqual(t);
        expect(screenToTile(left.x + EPS, left.y)).toEqual(t);
      }
    });

    it('picks the tile or its neighbour on either side of each edge midpoint', () => {
      for (const t of tiles) {
        const [top, right, bottom, left] = diamondPoints(t.x, t.y);
        // Each edge is shared with one neighbour: [corner a, corner b, neighbour].
        const edges = [
          [top, right, { x: t.x, y: t.y - 1 }],
          [right, bottom, { x: t.x + 1, y: t.y }],
          [bottom, left, { x: t.x, y: t.y + 1 }],
          [left, top, { x: t.x - 1, y: t.y }],
        ] as const;
        const c = tileToScreen(t.x, t.y);
        for (const [a, b, neighbour] of edges) {
          const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          // Unit vector from the tile center outward through the edge midpoint.
          const len = Math.hypot(mid.x - c.x, mid.y - c.y);
          const out = { x: (mid.x - c.x) / len, y: (mid.y - c.y) / len };
          expect(screenToTile(mid.x - out.x * EPS, mid.y - out.y * EPS)).toEqual(t);
          expect(screenToTile(mid.x + out.x * EPS, mid.y + out.y * EPS)).toEqual(neighbour);
        }
      }
    });
  });
});
