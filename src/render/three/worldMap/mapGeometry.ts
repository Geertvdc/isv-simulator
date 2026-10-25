/**
 * Small plane geometry shared by the world map's planners (markers, city
 * plan), in map units: rectangles, and distances to the road.
 */

import type { MapPoint, WorldMap } from '../../../flow/worldMap';

/** An axis-aligned rectangle on the map. */
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** How far `p` is from rectangle `r` (0 inside it). */
export function rectDistance(r: Rect, p: MapPoint): number {
  const dx = Math.max(r.x0 - p.x, 0, p.x - r.x1);
  const dy = Math.max(r.y0 - p.y, 0, p.y - r.y1);
  return Math.hypot(dx, dy);
}

/** The road's middle line as points about `step` apart. */
export function denseRoad(map: Pick<WorldMap, 'road'>, step = 0.1): MapPoint[] {
  const out: MapPoint[] = [];
  for (let i = 1; i < map.road.length; i++) {
    const a = map.road[i - 1];
    const b = map.road[i];
    if (!a || !b) continue;
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
    for (let k = 0; k < n; k++)
      out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  const last = map.road[map.road.length - 1];
  if (last) out.push({ ...last });
  return out;
}

/** How far `p` is from the polyline `road`. */
export function distanceToRoad(road: readonly MapPoint[], p: MapPoint): number {
  let best = Infinity;
  for (let i = 1; i < road.length; i++) {
    const a = road[i - 1];
    const b = road[i];
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.min(
      Math.max(((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1), 0),
      1,
    );
    best = Math.min(best, Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y));
  }
  return best;
}
