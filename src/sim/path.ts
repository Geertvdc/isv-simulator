/** Shortest walks over floor tiles, for bots and managers. */

import { type GridPoint, type LevelMap, getTile, isSolid } from './level';

export const NEIGHBOURS: readonly GridPoint[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

/**
 * Breadth-first search over floor tiles from `from` to the nearest tile where
 * `isGoal` holds, as a list of tiles starting after `from`. Empty when `from`
 * already is a goal; `null` when no goal can be reached. Tiles in `blocked`
 * are never walked through (but `from` itself may be one).
 */
export function searchPath(
  map: LevelMap,
  from: GridPoint,
  isGoal: (p: GridPoint) => boolean,
  blocked: readonly GridPoint[] = [],
): GridPoint[] | null {
  const key = (p: GridPoint): number => p.y * map.width + p.x;
  if (isGoal(from)) return [];
  const blockedKeys = new Set(blocked.map(key));
  const cameFrom = new Map<number, GridPoint | null>([[key(from), null]]);
  const queue: GridPoint[] = [from];
  for (let i = 0; i < queue.length; i++) {
    const at = queue[i];
    if (!at) break;
    for (const d of NEIGHBOURS) {
      const next = { x: at.x + d.x, y: at.y + d.y };
      if (isSolid(getTile(map, next.x, next.y)) || cameFrom.has(key(next))) continue;
      if (blockedKeys.has(key(next))) continue;
      cameFrom.set(key(next), at);
      if (isGoal(next)) {
        const path: GridPoint[] = [];
        for (let p: GridPoint | null | undefined = next; p && key(p) !== key(from);) {
          path.unshift(p);
          p = cameFrom.get(key(p));
        }
        return path;
      }
      queue.push(next);
    }
  }
  return null;
}

/** Shortest floor walk from `from` onto the floor tile `to`. */
export function pathTo(
  map: LevelMap,
  from: GridPoint,
  to: GridPoint,
  blocked: readonly GridPoint[] = [],
): GridPoint[] | null {
  return searchPath(map, from, (p) => p.x === to.x && p.y === to.y, blocked);
}
