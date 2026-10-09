/**
 * All isometric math lives here.
 *
 * World space is Phaser's world (camera-independent) pixel space. Tile (x, y)
 * is a diamond TILE_W wide and TILE_H tall, centered at `tileToScreen(x, y)`.
 * +x points toward the bottom right of the screen, +y toward the bottom left.
 *
 * The sim never sees any of this: it works in plain grid coordinates.
 */

export const TILE_W = 64;
export const TILE_H = 32;

const HALF_W = TILE_W / 2;
const HALF_H = TILE_H / 2;

export interface Point {
  x: number;
  y: number;
}

/** Center of the diamond for tile (x, y). Accepts fractional tiles. */
export function tileToScreen(x: number, y: number): Point {
  return { x: (x - y) * HALF_W, y: (x + y) * HALF_H };
}

/** The tile whose diamond contains the world point (sx, sy). */
export function screenToTile(sx: number, sy: number): Point {
  // `+ 0` turns -0 into 0 so callers can compare tiles with ===.
  return {
    x: Math.round(sy / TILE_H + sx / TILE_W) + 0,
    y: Math.round(sy / TILE_H - sx / TILE_W) + 0,
  };
}

/** Diamond corners of tile (x, y) on screen: top, right, bottom, left. */
export function diamondPoints(x: number, y: number): [Point, Point, Point, Point] {
  const c = tileToScreen(x, y);
  return [
    { x: c.x, y: c.y - HALF_H },
    { x: c.x + HALF_W, y: c.y },
    { x: c.x, y: c.y + HALF_H },
    { x: c.x - HALF_W, y: c.y },
  ];
}

/** Draw depth for something standing on tile (x, y): further back draws first. */
export function tileDepth(x: number, y: number): number {
  return x + y;
}
