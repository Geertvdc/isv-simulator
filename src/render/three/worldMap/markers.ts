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
};

export interface Marker {
  /** The flag's foot. */
  foot: MapPoint;
  /** The middle of the level number. */
  label: MapPoint;
}

/** Each node's flag and number, in node order. */
export function markerSpots(map: WorldMap): Marker[] {
  return map.nodes.map((node, i) => {
    const out = outside(map, i);
    const ahead = out.y >= 0;
    const aside = ahead ? FLAG_ASIDE.near : FLAG_ASIDE.far;
    const foot = { x: node.x + out.x * aside, y: node.y + out.y * aside };
    // In front of the flag on the near side of the road; where the flag stands on the far
    // side, the number goes beside it instead, so the flag doesn't hide it.
    const label = {
      x: foot.x + (ahead ? out.x * LABEL.aside : -LABEL.beside),
      y: foot.y + (ahead ? out.y * LABEL.aside : LABEL.lift),
    };
    return { foot, label };
  });
}

/**
 * The side of the road a flag stands on at node `index`: away from the bend
 * (where the road goes on from it), so flag and number stay clear of the road.
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
  const n = { x: -ty / len, y: tx / len };
  // Where the road bends to: both neighbours' pull from the flag.
  const inward =
    (before.x - here.x + after.x - here.x) * n.x + (before.y - here.y + after.y - here.y) * n.y;
  const sign = Math.abs(inward) > 0.05 ? -Math.sign(inward) : n.y >= 0 ? 1 : -1;
  return { x: n.x * sign, y: n.y * sign };
}
