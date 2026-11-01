/**
 * Which way blocks on a level map are cut: wall pieces, wall decorations,
 * groups of stations. Phaser-free, so it can be tested.
 */

import { type GridPoint, type LevelMap, type Tile, getTile } from '../sim/level';
import type { WallTheme } from './mapLook';

/**
 * A wall on the camera side of a room: on the map's front edge, or with
 * open room behind it. These are cut down so they never hide what's behind.
 */
export function isFrontWall(map: LevelMap, x: number, y: number): boolean {
  if (getTile(map, x, y) !== 'wall') return false;
  const behind = getTile(map, x, y - 1);
  return y === map.height - 1 || (behind !== null && behind !== 'wall');
}

/**
 * `wall` shows its front face, `wall-front` is cut down on the camera side,
 * `wall-inner` has a wall in front so only its top shows.
 */
export type WallPiece = 'wall' | 'wall-front' | 'wall-inner';

export function wallPiece(map: LevelMap, x: number, y: number): WallPiece {
  if (isFrontWall(map, x, y)) return 'wall-front';
  return getTile(map, x, y + 1) === 'wall' ? 'wall-inner' : 'wall';
}

/** The first `tile` on the map (row by row) and its direct neighbours of the same kind. */
export function firstGroup(map: LevelMap, tile: Tile): GridPoint[] {
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (getTile(map, x, y) !== tile) continue;
      const group = [{ x, y }];
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
        [-1, 0],
        [0, -1],
      ] as const) {
        if (getTile(map, x + dx, y + dy) === tile) group.push({ x: x + dx, y: y + dy });
      }
      return group;
    }
  }
  return [];
}

/** Things hung on walls that show their front face, per theme. */
export const WALL_DECOS: Readonly<Record<WallTheme, readonly string[]>> = {
  plaster: [
    'poster',
    'whiteboard',
    'clock',
    'kanban',
    'dashboard',
    'plants',
    'frames',
    'shelf',
    'pinboard',
    'braces',
    'tv',
  ],
  wood: [
    'poster',
    'whiteboard',
    'clock',
    'kanban',
    'dashboard',
    'plants',
    'frames',
    'shelf',
    'pinboard',
    'braces',
  ],
  glass: ['whiteboard', 'clock', 'dashboard', 'tv', 'braces'],
  // A garage: pegboard, a shelf of paint tins, the founders' sticky notes, a strip light.
  garage: ['pegboard', 'paintShelf', 'stickies', 'stripLight', 'cordReel', 'kanban'],
};
/** No two decorations this close along a wall are the same. */
export const WALL_DECO_SPREAD = 4;
/** One in this many front-facing walls gets a decoration. */
const WALL_DECO_EVERY = 3;

/**
 * A number for a level's own layout (from its tiles), so two levels of a
 * chapter get different surroundings and wall clutter. Render only.
 */
export function levelSalt(map: Pick<LevelMap, 'width' | 'height' | 'tiles'>): number {
  let h = 2166136261;
  const text = `${map.width}x${map.height}:${map.tiles.join(',')}`;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Small deterministic hash of a tile, so decorations stay put between runs. */
export function tileHash(x: number, y: number): number {
  return (Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0;
}

/** The decoration a tile would get by its hash alone, as an index, or null. */
function decoIndex(x: number, y: number, count: number, level: number): number | null {
  const hash = (tileHash(x, y) ^ level) >>> 0;
  if (hash % WALL_DECO_EVERY !== 0 || count === 0) return null;
  return Math.floor(hash / WALL_DECO_EVERY) % count;
}

/**
 * The decoration hung on the front of the wall on tile (x, y) with this
 * theme, if any, in the level `level` (its `levelSalt`). Only asked of
 * `wall` pieces. Picked by the tile's hash, then moved on from any
 * decoration just before it along the wall, so two close by never match.
 */
export function wallDeco(x: number, y: number, theme: WallTheme, level = 0): string | null {
  const decos = WALL_DECOS[theme];
  const own = decoIndex(x, y, decos.length, level);
  if (own === null) return null;
  // Walk the row from its start (maps are a few dozen tiles wide), so every
  // tile settles the same way.
  const picked: [number, number][] = [];
  let mine = own;
  for (let k = 0; k <= x; k++) {
    let index = decoIndex(k, y, decos.length, level);
    if (index === null) continue;
    const near = picked.filter(([px]) => k - px <= WALL_DECO_SPREAD).map(([, i]) => i);
    for (let t = 0; t < decos.length && near.includes(index); t++)
      index = (index + 1) % decos.length;
    picked.push([k, index]);
    mine = index;
  }
  return decos[mine] ?? null;
}
