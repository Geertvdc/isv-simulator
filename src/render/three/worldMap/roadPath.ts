/**
 * The road as something to drive along, as plain math (testable in Node):
 * the world map's road waypoints measured by distance, so the van can ask
 * "where am I, and which way does the road go, this far along it", plus the
 * van's drive: speeding up, cruising and braking to a stop at a target
 * distance, picking up from wherever it is when the target changes.
 * All in map units (tiles) and milliseconds.
 */

import type { MapPoint, WorldMap } from '../../../flow/worldMap';

export interface RoadPath {
  points: readonly MapPoint[];
  /** For each point, how far along the road it is. */
  distances: readonly number[];
  /** For each point, the road's direction there (unit length). */
  tangents: readonly MapPoint[];
  length: number;
  /** For each node (level), how far along the road its stop is. */
  nodeDistances: readonly number[];
}

/** The road of `map`, measured. */
export function buildRoadPath(map: Pick<WorldMap, 'road' | 'nodeWaypoints'>): RoadPath {
  // Drop repeated points (zero-length steps), keeping the node indices right.
  const points: MapPoint[] = [];
  const kept: number[] = [];
  for (const p of map.road) {
    const prev = points[points.length - 1];
    if (!prev || Math.hypot(p.x - prev.x, p.y - prev.y) > 1e-9) points.push({ x: p.x, y: p.y });
    kept.push(points.length - 1);
  }
  const distances: number[] = [];
  let total = 0;
  points.forEach((p, i) => {
    const prev = points[i - 1];
    if (prev) total += Math.hypot(p.x - prev.x, p.y - prev.y);
    distances.push(total);
  });
  const tangents = points.map((p, i) => {
    const a = points[Math.max(0, i - 1)] ?? p;
    const b = points[Math.min(points.length - 1, i + 1)] ?? p;
    return unit(b.x - a.x, b.y - a.y);
  });
  const nodeDistances = map.nodeWaypoints.map((w) => distances[kept[w] ?? 0] ?? 0);
  return { points, distances, tangents, length: total, nodeDistances };
}

/** The point `distance` along the road (held to its ends). */
export function pointAt(path: RoadPath, distance: number): MapPoint {
  const { i, t } = locate(path, distance);
  const a = path.points[i];
  const b = path.points[i + 1] ?? a;
  if (!a || !b) return { x: 0, y: 0 };
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/**
 * The road's direction `distance` along it, pointing the way distance
 * grows: unit length, blended between the waypoints so it turns smoothly.
 */
export function tangentAt(path: RoadPath, distance: number): MapPoint {
  const { i, t } = locate(path, distance);
  const a = path.tangents[i];
  const b = path.tangents[i + 1] ?? a;
  if (!a || !b) return { x: 1, y: 0 };
  return unit(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a);
}

/** The segment `distance` falls in, and how far along it (0 to 1). */
function locate(path: RoadPath, distance: number): { i: number; t: number } {
  const { distances } = path;
  const last = distances.length - 1;
  if (last <= 0) return { i: 0, t: 0 };
  const d = Math.min(Math.max(distance, 0), path.length);
  // Binary search for the last point at or before `d`.
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((distances[mid] ?? 0) <= d) lo = mid;
    else hi = mid;
  }
  const start = distances[lo] ?? 0;
  const span = (distances[lo + 1] ?? start) - start;
  return { i: lo, t: span > 0 ? (d - start) / span : 0 };
}

function unit(x: number, y: number, fallback: MapPoint = { x: 1, y: 0 }): MapPoint {
  const len = Math.hypot(x, y);
  return len > 1e-9 ? { x: x / len, y: y / len } : { ...fallback };
}

/** How the van drives: tiles per second, tiles per second squared. */
export interface DriveTuning {
  topSpeed: number;
  accel: number;
  /**
   * Further than this from its target (in tiles), the van hurries: top
   * speed and acceleration grow with the distance, up to `maxHurry` times,
   * so a jump over many levels doesn't take ages.
   */
  hurryGap: number;
  maxHurry: number;
}

/** The van's place on the road and its speed (negative: driving back). */
export interface Drive {
  distance: number;
  speed: number;
}

/** Closer than this to its target and slower than `STOP_SPEED`, the van is parked. */
const STOP_DISTANCE = 0.002;
const STOP_SPEED = 0.05;

/**
 * The drive `deltaMs` later, heading for `target`: it speeds up at
 * `accel` to at most `topSpeed`, and brakes at `accel` in time to stop on
 * the target. A new target mid-drive carries on from the current place and
 * speed (braking first if it lies behind).
 */
export function stepDrive(
  drive: Drive,
  target: number,
  deltaMs: number,
  tuning: DriveTuning,
): Drive {
  const dt = Math.max(0, deltaMs) / 1000;
  let { distance, speed } = drive;
  // Small steps, so braking lands on the target even on a slow frame.
  const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
  const h = dt / steps;
  for (let k = 0; k < steps; k++) {
    const gap = target - distance;
    const hurry = Math.min(Math.max(Math.abs(gap) / tuning.hurryGap, 1), tuning.maxHurry);
    const topSpeed = tuning.topSpeed * hurry;
    const accel = tuning.accel * hurry;
    if (Math.abs(gap) < STOP_DISTANCE && Math.abs(speed) < STOP_SPEED) {
      return { distance: target, speed: 0 };
    }
    // The fastest speed that can still stop on the target.
    const want = Math.sign(gap) * Math.min(topSpeed, Math.sqrt(2 * accel * Math.abs(gap)));
    const change = want - speed;
    speed += Math.sign(change) * Math.min(Math.abs(change), accel * h);
    const next = distance + speed * h;
    // Never drive past the target: reaching it is parking. (Braking keeps the speed
    // there low; only a new target just ahead of a fast van stops it short.)
    if ((target - distance) * (target - next) <= 0) {
      return { distance: target, speed: 0 };
    }
    distance = next;
  }
  return { distance, speed };
}
