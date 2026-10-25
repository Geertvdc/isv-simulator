/**
 * Where each level's flag and number stand on the world map, as plain math
 * (testable in Node): beside the road on the outside of its bend, so the
 * van parked on the stop leaves both in view. The diorama puts them there,
 * and the city planner keeps its buildings clear of them.
 */

import type { MapPoint, WorldMap } from '../../../flow/worldMap';

/**
 * How far beside the road (on the outside of its bend) a flag stands, clear
 * of the van parked on the stop: further on the far side, where the van's
 * cab and box stand up in front of the flag's foot.
 */
export const FLAG_ASIDE = { near: 1.05, far: 1.35 };
/** The level number lying on the ground, by the flag. */
export const LABEL = {
  aside: 0.8,
  /** Left of a flag on the far side of the road, and a little nearer the camera. */
  beside: 1.05,
  lift: 0.2,
  width: 1.4,
  height: 0.7,
  /** Its edge stays this far from the road's middle line (the road is 0.74 wide). */
  roadGap: 0.55,
};

export interface Marker {
  /** The flag's foot. */
  foot: MapPoint;
  /** The middle of the level number. */
  label: MapPoint;
}

/**
 * Each node's flag and number, in node order. The flag stands on the
 * outside of the road's bend (see `outside`), unless it or its number
 * finds no clear place there and does on the other side. Where the
 * number's usual place (see `labelSpots`) would lie on the road or on
 * another number, it takes the first other place that is clear.
 */
export function markerSpots(map: WorldMap): Marker[] {
  const placed: MapPoint[] = [];
  // How badly a number's spot breaks the rules: off the land is worst, then on the
  // road, then on another number. 0 when it breaks none.
  const trouble = (spot: MapPoint): number => {
    const offLand = spot.x - LABEL.width / 2 < 0 || spot.x + LABEL.width / 2 > map.width;
    const onLabel = placed.some(
      (p) => Math.abs(p.x - spot.x) < LABEL.width && Math.abs(p.y - spot.y) < LABEL.height,
    );
    const roadShort = Math.max(0, LABEL.roadGap - roadGap(map.road, spot));
    return (offLand ? 100 : 0) + roadShort * 20 + (onLabel ? 5 : 0);
  };
  return map.nodes.map((node, i) => {
    const preferred = outside(map, i);
    let best: (Marker & { trouble: number }) | null = null;
    for (const out of [preferred, { x: -preferred.x, y: -preferred.y }]) {
      const ahead = out.y >= 0;
      const aside = ahead ? FLAG_ASIDE.near : FLAG_ASIDE.far;
      const foot = { x: node.x + out.x * aside, y: node.y + out.y * aside };
      // A flag closer to the road than its side's distance stands on a bend's inside.
      const cramped = distanceToRoad(map.road, foot) < aside - 0.01 ? 100 : 0;
      for (const label of labelSpots(foot, out, ahead)) {
        const t = cramped + trouble(label);
        if (!best || t < best.trouble) best = { foot, label, trouble: t };
        if (t === 0) break;
      }
      if (best?.trouble === 0) break;
    }
    const { foot, label } = best ?? { foot: node, label: node };
    placed.push(label);
    return { foot, label };
  });
}

/**
 * Where the number of a flag at `foot` may lie, best first: on the near
 * side of the road in front of the flag (or beside it, or straight in
 * front); on the far side beside it, left then right, where the flag
 * would hide a number in front of it (so that is the last resort there).
 * Then the same places a little further out.
 */
function labelSpots(foot: MapPoint, out: MapPoint, ahead: boolean): MapPoint[] {
  const ring = (k: number): MapPoint[] => {
    const front = { x: foot.x + out.x * LABEL.aside * k, y: foot.y + out.y * LABEL.aside * k };
    const left = { x: foot.x - LABEL.beside * k, y: foot.y + LABEL.lift };
    const right = { x: foot.x + LABEL.beside * k, y: foot.y + LABEL.lift };
    const below = { x: foot.x, y: foot.y + LABEL.aside * k };
    return ahead ? [front, left, right, below] : [left, right, front];
  };
  return [...ring(1), ...ring(1.4)];
}

/** How far a number lying at `at` is from the middle of `road`: from its nearest edge. */
function roadGap(road: readonly MapPoint[], at: MapPoint): number {
  const x0 = at.x - LABEL.width / 2;
  const x1 = at.x + LABEL.width / 2;
  const y0 = at.y - LABEL.height / 2;
  const y1 = at.y + LABEL.height / 2;
  let gap = Infinity;
  for (let i = 1; i < road.length; i++) {
    const a = road[i - 1];
    const b = road[i];
    if (!a || !b) continue;
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.1));
    for (let s = 0; s <= steps; s++) {
      const x = a.x + ((b.x - a.x) * s) / steps;
      const y = a.y + ((b.y - a.y) * s) / steps;
      gap = Math.min(gap, Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(y0 - y, 0, y - y1)));
    }
  }
  return gap;
}

/**
 * The side of the road a flag stands on at node `index`: away from the bend
 * (where the road goes on from it), so flag and number stay clear of the road.
 * At the road's two ends, where it runs straight off to the shore, the flag
 * stands in front, so the van parked on the stop doesn't hide its number.
 * A unit map direction.
 */
function outside(map: WorldMap, index: number): MapPoint {
  const w = map.nodeWaypoints[index] ?? 0;
  const here = map.road[w] ?? { x: 0, y: 0 };
  const before = map.road[Math.max(0, w - 3)] ?? here;
  const after = map.road[Math.min(map.road.length - 1, w + 3)] ?? here;
  const tx = after.x - before.x;
  const ty = after.y - before.y;
  const len = Math.hypot(tx, ty) || 1;
  // Pointing to the near side: the road runs left to right.
  const n = { x: -ty / len, y: tx / len };
  if (index === 0 || index === map.nodes.length - 1) return n;
  // Where the road bends to: both neighbours' pull from the flag.
  const inward =
    (before.x - here.x + after.x - here.x) * n.x + (before.y - here.y + after.y - here.y) * n.y;
  const sign = Math.abs(inward) > 0.05 ? -Math.sign(inward) : n.y >= 0 ? 1 : -1;
  return { x: n.x * sign, y: n.y * sign };
}

/** How far `p` is from the road's middle line. */
function distanceToRoad(road: readonly MapPoint[], p: MapPoint): number {
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
