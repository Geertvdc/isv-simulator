/** Shortest walks over floor tiles (and lift rides), for bots and managers. */

import { type GridPoint, type LevelMap, getTile, isSolid } from './level';
import { LIFT_PATH_STEPS } from './balance';
import { liftLinks } from './lifts';
import { type Gate, gateRefuses } from './reorgs';

export const NEIGHBOURS: readonly GridPoint[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

/**
 * Shortest search over floor tiles from `from` to the nearest tile where
 * `isGoal` holds, as a list of tiles starting after `from`. Empty when `from`
 * already is a goal; `null` when no goal can be reached. Tiles in `blocked`
 * are never walked through (but `from` itself may be one).
 *
 * A step costs 1; a lift ride to the next floor costs `LIFT_PATH_STEPS` (the
 * wait and the ride), so a walk takes the stairs when they're quicker. On a
 * map without lifts this is a plain breadth-first search.
 */
export function searchPath(
  map: LevelMap,
  from: GridPoint,
  isGoal: (p: GridPoint) => boolean,
  blocked: readonly GridPoint[] = [],
  gates: readonly Gate[] = [],
): GridPoint[] | null {
  const key = (p: GridPoint): number => p.y * map.width + p.x;
  if (isGoal(from)) return [];
  const blockedKeys = new Set(blocked.map(key));
  const links = liftLinks(map);
  const cameFrom = new Map<number, GridPoint | null>([[key(from), null]]);
  const cost = new Map<number, number>([[key(from), 0]]);
  // Tiles by their cost (Dial's algorithm): costs are small whole numbers.
  const buckets: GridPoint[][] = [[from]];
  /** The cheapest goal reached by lift so far: it only counts once nothing cheaper turns up. */
  let liftGoal: { at: GridPoint; cost: number } | null = null;
  const pathTo = (end: GridPoint): GridPoint[] => {
    const path: GridPoint[] = [];
    for (let p: GridPoint | null | undefined = end; p && key(p) !== key(from);) {
      path.unshift(p);
      p = cameFrom.get(key(p));
    }
    return path;
  };
  for (let c = 0; c < buckets.length; c++) {
    if (liftGoal && liftGoal.cost <= c) return pathTo(liftGoal.at);
    const bucket = buckets[c] ?? [];
    for (let i = 0; i < bucket.length; i++) {
      const at = bucket[i];
      if (!at || cost.get(key(at)) !== c) continue;
      // Next door first, then by lift to the floors next to this one (bots and managers wait in the cabin).
      const steps: [GridPoint, number][] = [
        ...NEIGHBOURS.map((d): [GridPoint, number] => [{ x: at.x + d.x, y: at.y + d.y }, 1]),
        ...(links.get(key(at)) ?? []).map((p): [GridPoint, number] => [p, LIFT_PATH_STEPS]),
      ];
      for (const [next, stepCost] of steps) {
        const nextCost = c + stepCost;
        const known = cost.get(key(next));
        if (isSolid(getTile(map, next.x, next.y)) || (known !== undefined && known <= nextCost)) {
          continue;
        }
        if (blockedKeys.has(key(next))) continue;
        if (stepCost === 1 && gateRefuses(gates, at, next)) continue;
        cameFrom.set(key(next), at);
        cost.set(key(next), nextCost);
        if (isGoal(next)) {
          if (stepCost === 1 && !(liftGoal && liftGoal.cost < nextCost)) return pathTo(next);
          if (!liftGoal || nextCost < liftGoal.cost) liftGoal = { at: next, cost: nextCost };
        }
        (buckets[nextCost] ??= []).push(next);
      }
    }
  }
  return liftGoal ? pathTo(liftGoal.at) : null;
}

/** Shortest floor walk from `from` onto the floor tile `to`. */
export function pathTo(
  map: LevelMap,
  from: GridPoint,
  to: GridPoint,
  blocked: readonly GridPoint[] = [],
  gates: readonly Gate[] = [],
): GridPoint[] | null {
  return searchPath(map, from, (p) => p.x === to.x && p.y === to.y, blocked, gates);
}
