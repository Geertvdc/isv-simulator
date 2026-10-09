/**
 * All isometric math lives here.
 *
 * World space is Phaser's world (camera-independent) pixel space. Tile (x, y)
 * is a diamond TILE_W wide and TILE_H tall, centered at `tileToScreen(x, y)`.
 *
 * The view can be rotated in 90° steps. Tile coordinates are first rotated
 * into view coordinates (u, v), which are then projected: u grows toward the
 * bottom right of the screen, v toward the bottom left. At rotation 0,
 * (u, v) = (x, y). Each step turns the map a quarter clockwise on screen.
 */

export const TILE_W = 64;
export const TILE_H = 32;

const HALF_W = TILE_W / 2;
const HALF_H = TILE_H / 2;

export interface Point {
  x: number;
  y: number;
}

/** Number of quarter turns clockwise. */
export type Rotation = 0 | 1 | 2 | 3;

/** Rotation after turning `steps` quarter turns (negative = counter-clockwise). */
export function rotate(rotation: Rotation, steps: number): Rotation {
  return ((((rotation + steps) % 4) + 4) % 4) as Rotation;
}

/** Tile coordinates to view coordinates. */
function toView(x: number, y: number, rotation: Rotation): Point {
  switch (rotation) {
    case 0:
      return { x, y };
    case 1:
      return { x: -y, y: x };
    case 2:
      return { x: -x, y: -y };
    case 3:
      return { x: y, y: -x };
  }
}

/** View coordinates back to tile coordinates (inverse of `toView`). */
function fromView(u: number, v: number, rotation: Rotation): Point {
  // `+ 0` turns -0 into 0 so callers can compare tiles with ===.
  switch (rotation) {
    case 0:
      return { x: u + 0, y: v + 0 };
    case 1:
      return { x: v + 0, y: -u + 0 };
    case 2:
      return { x: -u + 0, y: -v + 0 };
    case 3:
      return { x: -v + 0, y: u + 0 };
  }
}

/** Center of the diamond for tile (x, y). Accepts fractional tiles. */
export function tileToScreen(x: number, y: number, rotation: Rotation = 0): Point {
  const view = toView(x, y, rotation);
  return { x: (view.x - view.y) * HALF_W, y: (view.x + view.y) * HALF_H };
}

/** Fractional tile coordinates for a world point (inverse of `tileToScreen`). */
export function screenToTileFloat(sx: number, sy: number, rotation: Rotation = 0): Point {
  return fromView(sy / TILE_H + sx / TILE_W, sy / TILE_H - sx / TILE_W, rotation);
}

/** The tile whose diamond contains the world point (sx, sy). */
export function screenToTile(sx: number, sy: number, rotation: Rotation = 0): Point {
  // Round in view space: that is where the diamonds are axis-aligned.
  const u = Math.round(sy / TILE_H + sx / TILE_W);
  const v = Math.round(sy / TILE_H - sx / TILE_W);
  return fromView(u, v, rotation);
}

/** Diamond corners of tile (x, y) on screen: top, right, bottom, left. */
export function diamondPoints(
  x: number,
  y: number,
  rotation: Rotation = 0,
): [Point, Point, Point, Point] {
  const c = tileToScreen(x, y, rotation);
  return [
    { x: c.x, y: c.y - HALF_H },
    { x: c.x + HALF_W, y: c.y },
    { x: c.x, y: c.y + HALF_H },
    { x: c.x - HALF_W, y: c.y },
  ];
}

/** Draw depth for something standing on tile (x, y): further back draws first. */
export function tileDepth(x: number, y: number, rotation: Rotation = 0): number {
  const view = toView(x, y, rotation);
  return view.x + view.y;
}
