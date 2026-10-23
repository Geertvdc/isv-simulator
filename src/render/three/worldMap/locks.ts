/**
 * What is locked on the world map and what just opened, as plain math
 * (testable in Node): the lock state in map order, the difference since
 * the map last showed (which chapters' clouds roll away, which flags pop
 * up), where the van has to stop at a closed gate, and where the cloud
 * puffs over a locked chapter sit.
 */

import type { MapPoint, MapRegion, WorldMap } from '../../../flow/worldMap';
import type { MenuView } from '../../menuView';
import { seeded } from './cityPlan';

/** What is open, in map order: per chapter and per node. */
export interface LockState {
  chapters: readonly boolean[];
  levels: readonly boolean[];
}

/** The lock state of `view`, per node of `map` (a level the view doesn't know is locked). */
export function lockStateOf(map: Pick<WorldMap, 'levelIds'>, view: MenuView): LockState {
  return {
    chapters: [...view.chapterOpen],
    levels: map.levelIds.map((id) => view.levels[view.levelIds.indexOf(id)]?.open ?? false),
  };
}

export function sameLocks(a: LockState | null, b: LockState): boolean {
  return (
    a !== null &&
    a.chapters.length === b.chapters.length &&
    a.levels.length === b.levels.length &&
    a.chapters.every((open, i) => open === b.chapters[i]) &&
    a.levels.every((open, i) => open === b.levels[i])
  );
}

export interface Opened {
  chapters: number[];
  levels: number[];
}

/**
 * The chapters and nodes open in `now` that weren't in `before`. With no
 * `before` (the map's first showing since the page loaded) nothing counts
 * as new: the map just shows how things stand.
 */
export function newlyOpened(before: LockState | null, now: LockState): Opened {
  if (!before) return { chapters: [], levels: [] };
  const fresh = (was: readonly boolean[], is: readonly boolean[]): number[] =>
    is.flatMap((open, i) => (open && was[i] !== true ? [i] : []));
  return {
    chapters: fresh(before.chapters, now.chapters),
    levels: fresh(before.levels, now.levels),
  };
}

/**
 * Where the van stops on its way to `target` (a distance along the road):
 * at the target, or before the first closed gate on the way there.
 * `gateStops[k]` is where the van waits in front of gate k (of chapter
 * `gateChapters[k]`), in road distance.
 */
export function vanStop(
  target: number,
  gateStops: readonly number[],
  gateChapters: readonly number[],
  chapterOpen: readonly boolean[],
): number {
  let stop = target;
  gateStops.forEach((at, k) => {
    const chapter = gateChapters[k] ?? -1;
    if (chapterOpen[chapter] === false && at < stop) stop = at;
  });
  return stop;
}

/** The point on `road` nearest `point`, as a distance along it. */
export function distanceAlong(road: readonly MapPoint[], point: MapPoint): number {
  let best = Infinity;
  let bestDistance = 0;
  let walked = 0;
  for (let i = 1; i < road.length; i++) {
    const a = road[i - 1];
    const b = road[i];
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const len = Math.sqrt(len2);
    const t =
      len2 > 0 ? Math.min(Math.max(((point.x - a.x) * dx + (point.y - a.y) * dy) / len2, 0), 1) : 0;
    const d = Math.hypot(a.x + dx * t - point.x, a.y + dy * t - point.y);
    if (d < best) {
      best = d;
      bestDistance = walked + len * t;
    }
    walked += len;
  }
  return bestDistance;
}

/** One cloud puff: a squashed ball in map units, `z` its height over the ground. */
export interface Puff {
  x: number;
  y: number;
  z: number;
  /** Radius across; it is `squash` times as tall. */
  r: number;
  squash: number;
  /** For its drift and bob, so the puffs don't move in step. */
  phase: number;
}

interface Layer {
  step: number;
  r: readonly [number, number];
  z: readonly [number, number];
}

/** The cloud bank: puffs on a grid, a low layer that hides the ground and a puffy top. */
export const CLOUDS = {
  low: { step: 1.45, r: [0.95, 1.5], z: [0.5, 0.9] } as Layer,
  top: { step: 2.6, r: [1.3, 1.95], z: [1.3, 1.85] } as Layer,
  squash: 0.58,
  /** How far past the island's back and front edges the bank reaches. */
  overhang: 1,
  /** How far a puff drifts to and fro: they stay this far in from the region's sides. */
  drift: 0.15,
  /** How far a bank reaches over its right edge, into the next (locked) chapter. */
  seam: 0.9,
};

/**
 * The puffs over `region` (whose land reaches `back` tiles behind the
 * map's top row). They never reach left of the region, so the chapter
 * before (open whenever this one shows its gate) stays in view, up to the
 * gate. They do reach `CLOUDS.seam` into the next chapter, so two locked
 * chapters' banks meet without a gap: star gates only grow from chapter to
 * chapter, so the next one is locked whenever this one is. Deterministic
 * per region.
 */
export function cloudPuffs(region: MapRegion, back: number): Puff[] {
  const random = seeded(region.chapter + 101);
  const puffs: Puff[] = [];
  const top = -back - CLOUDS.overhang;
  const bottom = region.height + CLOUDS.overhang;
  for (const layer of [CLOUDS.low, CLOUDS.top]) {
    const [rMin, rMax] = layer.r;
    const [zMin, zMax] = layer.z;
    const columns = Math.max(
      1,
      Math.round((region.width + CLOUDS.seam - rMin * 2) / layer.step) + 1,
    );
    const rows = Math.max(1, Math.round((bottom - top) / layer.step) + 1);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < columns; col++) {
        const r = rMin + random() * (rMax - rMin);
        // Every other row shifts half a step, so the bank has no straight lanes.
        const shift = row % 2 === 0 ? 0 : layer.step / 2;
        const span = region.width + CLOUDS.seam - (r + CLOUDS.drift) * 2;
        const x =
          region.x +
          CLOUDS.drift +
          r +
          Math.min(span, Math.max(0, col * layer.step + shift + (random() - 0.5) * 0.7));
        const y = top + row * ((bottom - top) / Math.max(1, rows - 1)) + (random() - 0.5) * 0.8;
        puffs.push({
          x,
          y,
          z: zMin + random() * (zMax - zMin),
          r,
          squash: CLOUDS.squash * (0.85 + random() * 0.3),
          phase: random() * Math.PI * 2,
        });
      }
    }
  }
  return puffs;
}
