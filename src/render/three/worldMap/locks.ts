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

/**
 * The cloud bank: a flat base of puffs that hides the ground, and on it
 * cloud masses, each a big puff with smaller ones clumped round its rim, so
 * the bank has a real cloud silhouette instead of an even grid of balls.
 */
export const CLOUDS = {
  base: { step: 2.1, r: [1.1, 1.5], z: [0.3, 0.55], squash: 0.5 },
  mass: {
    step: { x: 3.3, y: 3.7 },
    jitter: 0.7,
    core: { r: [1.7, 2.3], z: [1.05, 1.45], squash: 0.62 },
    rim: { count: [4, 6], r: [0.6, 1.1], z: [0.7, 1.1], out: [0.75, 1.15], squash: 0.7 },
  },
  /** How far past the island's back and front edges the bank reaches. */
  overhang: 1,
  /** How far a puff drifts to and fro: they stay this far in from the region's sides. */
  drift: 0.15,
  /** How far a bank reaches over its right edge, into the next (locked) chapter. */
  seam: 0.9,
};

type Range = readonly number[];

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
  const between = ([lo = 0, hi = lo]: Range): number => lo + random() * (hi - lo);
  const puffs: Puff[] = [];
  const top = -back - CLOUDS.overhang;
  const bottom = region.height + CLOUDS.overhang;
  const left = region.x + CLOUDS.drift;
  const right = region.x + region.width + CLOUDS.seam - CLOUDS.drift;
  const add = (x: number, y: number, z: number, r: number, squash: number): void => {
    // Kept whole inside the bank's sides, however big.
    const fit = Math.min(r, (right - left) / 2);
    puffs.push({
      x: Math.min(Math.max(x, left + fit), right - fit),
      y,
      z,
      r: fit,
      squash: squash * (0.9 + random() * 0.2),
      phase: random() * Math.PI * 2,
    });
  };
  // Lay a grid over the bank, `step` apart, centered on it.
  const grid = (stepX: number, stepY: number, each: (x: number, y: number) => void): void => {
    const columns = Math.max(1, Math.round((right - left) / stepX));
    const rows = Math.max(1, Math.round((bottom - top) / stepY) + 1);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < columns; col++) {
        const shift = row % 2 === 0 ? 0.25 : 0.75;
        each(
          left + ((col + shift) * (right - left)) / columns,
          top + (row * (bottom - top)) / Math.max(1, rows - 1),
        );
      }
    }
  };
  const { base, mass } = CLOUDS;
  grid(base.step, base.step, (x, y) => {
    add(x, y, between(base.z), between(base.r), base.squash);
  });
  grid(mass.step.x, mass.step.y, (gx, gy) => {
    const x = gx + (random() - 0.5) * mass.jitter * 2;
    const y = gy + (random() - 0.5) * mass.jitter * 2;
    const core = between(mass.core.r);
    add(x, y, between(mass.core.z), core, mass.core.squash);
    const count = Math.round(between(mass.rim.count));
    const start = random() * Math.PI * 2;
    for (let k = 0; k < count; k++) {
      const a = start + (k / count) * Math.PI * 2 + (random() - 0.5) * 0.6;
      const out = core * between(mass.rim.out);
      add(
        x + Math.cos(a) * out,
        y + Math.sin(a) * out * 0.8,
        between(mass.rim.z),
        between(mass.rim.r),
        mass.rim.squash,
      );
    }
  });
  return puffs;
}
