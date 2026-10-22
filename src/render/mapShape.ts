/**
 * Which way blocks on a level map are cut, shared by the 2D and 3D looks.
 * Phaser-free, so it can be tested.
 */

import { type GridPoint, type LevelMap, type Tile, getTile } from '../sim/level';

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
