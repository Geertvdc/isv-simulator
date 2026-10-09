/**
 * All projection math lives here: grid coordinates to screen and back.
 *
 * The camera looks at the level from the front and above, Overcooked style:
 * grid +x runs to the right and +y toward the viewer (down on screen). The
 * floor is squashed vertically by VIEW_PITCH. VIEW_YAW can turn the level a
 * little so one side face of each block shows; at 0 the front edge is exactly
 * horizontal and only top and front faces show. World space is Phaser's world
 * (camera-independent) pixel space; tile (x, y) is centered at `tileToScreen(x, y)`.
 *
 * The sim never sees any of this: it works in plain grid coordinates.
 */

/** Screen width of one tile at zero yaw. */
export const TILE_SIZE = 64;
/** Vertical squash of the floor: 1 is straight top-down, lower is a flatter view. */
export const VIEW_PITCH = 0.6;
/** Clockwise turn of the level on screen, in radians. 0 makes the front edge exactly horizontal. */
export const VIEW_YAW: number = 0;

const COS = Math.cos(VIEW_YAW);
const SIN = Math.sin(VIEW_YAW);

export interface Point {
  x: number;
  y: number;
}

/** Center of tile (x, y) on screen. Accepts fractional tiles. */
export function tileToScreen(x: number, y: number): Point {
  return {
    x: (x * COS - y * SIN) * TILE_SIZE,
    y: (x * SIN + y * COS) * TILE_SIZE * VIEW_PITCH,
  };
}

/** Fractional grid coordinates for a world point (inverse of `tileToScreen`). */
export function screenToGrid(sx: number, sy: number): Point {
  const u = sx / TILE_SIZE;
  const v = sy / (TILE_SIZE * VIEW_PITCH);
  return { x: u * COS + v * SIN, y: v * COS - u * SIN };
}

/** The tile whose floor contains the world point (sx, sy). */
export function screenToTile(sx: number, sy: number): Point {
  const g = screenToGrid(sx, sy);
  // `+ 0` turns -0 into 0 so callers can compare tiles with ===.
  return { x: Math.round(g.x) + 0, y: Math.round(g.y) + 0 };
}

/** Floor corners of tile (x, y) on screen: back left, back right, front right, front left. */
export function tileCorners(x: number, y: number): [Point, Point, Point, Point] {
  return [
    tileToScreen(x - 0.5, y - 0.5),
    tileToScreen(x + 0.5, y - 0.5),
    tileToScreen(x + 0.5, y + 0.5),
    tileToScreen(x - 0.5, y + 0.5),
  ];
}

/** Draw depth for something standing on tile (x, y): further back draws first. */
export function tileDepth(x: number, y: number): number {
  return x * SIN + y * COS;
}

export type Side = 'back' | 'right' | 'front' | 'left';

export interface BlockFaces {
  top: Point[];
  /** Side faces that face the viewer, in draw order. */
  sides: { side: Side; points: Point[] }[];
}

/** Grid normal of each side, in the same order as the edges of `tileCorners`. */
const SIDE_NORMALS: readonly [Side, number, number][] = [
  ['back', 0, -1],
  ['right', 1, 0],
  ['front', 0, 1],
  ['left', -1, 0],
];

/** Visible faces of a block on tile (x, y) that sticks `height` screen pixels up. */
export function blockFaces(x: number, y: number, height: number): BlockFaces {
  const base = tileCorners(x, y);
  const up = (p: Point): Point => ({ x: p.x, y: p.y - height });
  const sides: BlockFaces['sides'] = [];
  SIDE_NORMALS.forEach(([side, nx, ny], i) => {
    // A side faces the viewer when its normal points down on screen.
    if (nx * SIN + ny * COS <= 0) return;
    const a = base[i] as Point;
    const b = base[(i + 1) % 4] as Point;
    sides.push({ side, points: [a, b, up(b), up(a)] });
  });
  return { top: base.map(up), sides };
}
