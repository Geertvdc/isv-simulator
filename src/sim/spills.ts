/**
 * Spills (Startup chapter): wet floor that players slide on.
 *
 * - `_` tiles are wet all round.
 * - A leaky tap (`o`, a solid tile) floods its spill zone (`%` tiles) ring by
 *   ring on a timer, until someone holds work at it; then the zone dries,
 *   outer ring first, and the timer starts again.
 * - The mop robot (a manager of kind `mopRobot`, see `manager.ts`) drives the
 *   `r` loop and leaves a trail that stays wet for a while.
 *
 * Dynamic wetness lives in `GameState.wet`: tile index to the tick it dries.
 */

import {
  MOP_TRAIL_TICKS,
  TAP_DRY_TICKS,
  TAP_FIX_TICKS,
  TAP_FLOOD_RING_TICKS,
  TAP_WARNING_TICKS,
} from './balance';
import { type GridPoint, type LevelMap, markAt, marksOf } from './level';
import type { GameState } from './state';

/** When taps leak: the first leak and the time from a fix (dry again) to the next one. */
export interface SpillSchedule {
  firstLeakTick: number;
  /** Ticks from a fixed tap having dried to its next leak. */
  everyTicks: number;
}

/** A spill zone tile and how many rings out from the tap it is (0: next to it). */
export interface ZoneTile {
  index: number;
  ring: number;
}

export interface Tap {
  x: number;
  y: number;
  /** `dry`: waits for `nextLeakTick`; `leaking`: floods; `drying`: fixed, the zone dries. */
  phase: 'dry' | 'leaking' | 'drying';
  /** In `dry`: when it starts leaking. */
  nextLeakTick: number;
  /** In `leaking`: when it started. In `drying`: when it was fixed. */
  since: number;
  /** Ticks of fixing work done on this leak. */
  fixTicks: number;
  /** The last tick someone worked on it: one tick of work per tick, however many work. */
  lastFixTick: number;
  zone: ZoneTile[];
}

/** Tile index to the tick it dries (`GameState.wet`). */
export type WetTiles = Record<string, number>;

/** Whether a tile is wet: a `_` tile, or wet for now. */
export type WetCheck = (x: number, y: number) => boolean;

/** Nothing is wet. */
export const DRY: WetCheck = () => false;

function inBounds(map: LevelMap, p: GridPoint): boolean {
  return p.x >= 0 && p.y >= 0 && p.x < map.width && p.y < map.height;
}

const SIDES: readonly GridPoint[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

/**
 * The taps of a map and their zones: every `%` tile belongs to the tap it is
 * the fewest `%` steps from (ties: the first tap in reading order).
 */
export function createTaps(map: LevelMap, schedule: SpillSchedule | undefined): Tap[] {
  const taps = marksOf(map, 'tap');
  const zone = new Set(marksOf(map, 'spillZone').map((p) => p.y * map.width + p.x));
  const owner = new Map<number, { tap: number; ring: number }>();
  taps.forEach((tap, t) => {
    const frontier: { p: GridPoint; ring: number }[] = [];
    for (const d of SIDES) frontier.push({ p: { x: tap.x + d.x, y: tap.y + d.y }, ring: 0 });
    const seen = new Set<number>();
    while (frontier.length > 0) {
      const next = frontier.shift();
      if (!next) break;
      const { p, ring } = next;
      const index = p.y * map.width + p.x;
      // The flood runs through the zone and over floor that is wet anyway (`_`).
      const wetAnyway = inBounds(map, p) && markAt(map, p.x, p.y) === 'wet';
      if (!inBounds(map, p) || (!zone.has(index) && !wetAnyway) || seen.has(index)) continue;
      seen.add(index);
      const had = owner.get(index);
      if (zone.has(index) && (!had || had.ring > ring)) owner.set(index, { tap: t, ring });
      for (const d of SIDES) frontier.push({ p: { x: p.x + d.x, y: p.y + d.y }, ring: ring + 1 });
    }
  });
  return taps.map((tap, t): Tap => {
    const mine = [...owner.entries()].filter(([, o]) => o.tap === t);
    // Rings count from the zone's first tiles, however far the zone starts from the tap.
    const first = Math.min(...mine.map(([, o]) => o.ring));
    return {
      x: tap.x,
      y: tap.y,
      phase: 'dry' as const,
      nextLeakTick: schedule?.firstLeakTick ?? Number.MAX_SAFE_INTEGER,
      since: 0,
      fixTicks: 0,
      lastFixTick: -1,
      zone: mine
        .map(([index, o]) => ({ index, ring: o.ring - first }))
        .sort((a, b) => a.index - b.index),
    };
  });
}

/** Whether a dry tap drips and wobbles: it leaks soon. */
export function tapWarns(tap: Tap, tick: number): boolean {
  return tap.phase === 'dry' && tap.nextLeakTick - tick <= TAP_WARNING_TICKS;
}

/** Share of the fix done, 0 to 1. */
export function tapFixShare(tap: Tap): number {
  return Math.min(1, tap.fixTicks / TAP_FIX_TICKS);
}

function outerRing(tap: Tap): number {
  return tap.zone.reduce((max, z) => Math.max(max, z.ring), 0);
}

/** The tap on tile (x, y), if there is one. */
export function tapAt(state: GameState, x: number, y: number): Tap | undefined {
  return state.taps.find((t) => t.x === x && t.y === y);
}

/**
 * One tick of work on the tap at (x, y). Returns whether there was a leak to
 * fix. A fixed tap stops leaking and its zone dries, outer ring first.
 */
export function workTap(state: GameState, x: number, y: number): boolean {
  const tap = tapAt(state, x, y);
  if (tap?.phase !== 'leaking') return false;
  if (tap.lastFixTick !== state.tick) {
    tap.lastFixTick = state.tick;
    tap.fixTicks++;
  }
  if (tap.fixTicks >= TAP_FIX_TICKS) {
    tap.phase = 'drying';
    tap.since = state.tick;
    const outer = outerRing(tap);
    const perRing = TAP_DRY_TICKS / (outer + 1);
    for (const z of tap.zone) {
      // Wet now (the tap leaked), dries from the outside in.
      state.wet[String(z.index)] = state.tick + Math.round(perRing * (outer - z.ring + 1));
    }
    state.events.push({ type: 'tapFixed', x, y });
  }
  return true;
}

function updateTap(state: GameState, tap: Tap): void {
  if (tap.phase === 'dry' && state.tick >= tap.nextLeakTick) {
    tap.phase = 'leaking';
    tap.since = state.tick;
    tap.fixTicks = 0;
    state.events.push({ type: 'tapLeaking', x: tap.x, y: tap.y });
  }
  if (tap.phase === 'leaking') {
    const rings = Math.floor((state.tick - tap.since) / TAP_FLOOD_RING_TICKS) + 1;
    for (const z of tap.zone) {
      // Kept wet a tick ahead while it leaks.
      if (z.ring < rings) state.wet[String(z.index)] = state.tick + 2;
    }
  }
  if (tap.phase === 'drying' && state.tick - tap.since >= TAP_DRY_TICKS) {
    tap.phase = 'dry';
    tap.nextLeakTick = state.tick + (state.settings.spills?.everyTicks ?? Number.MAX_SAFE_INTEGER);
  }
}

/** Per tick: taps leak and dry, the mop robots wet their tile, and dry tiles are forgotten. */
export function updateSpills(state: GameState): void {
  for (const tap of state.taps) updateTap(state, tap);
  for (const robot of state.managers) {
    if (robot.kind !== 'mopRobot') continue;
    const index = Math.round(robot.pos.y) * state.level.width + Math.round(robot.pos.x);
    state.wet[String(index)] = state.tick + MOP_TRAIL_TICKS;
  }
  if (Object.values(state.wet).some((dryAt) => dryAt <= state.tick)) {
    state.wet = Object.fromEntries(
      Object.entries(state.wet).filter(([, dryAt]) => dryAt > state.tick),
    );
  }
}

/** Whether tile (x, y) is wet at `tick`: a `_` tile, or still wet from a leak or the mop. */
export function isWet(map: LevelMap, wet: WetTiles, tick: number, x: number, y: number): boolean {
  if (markAt(map, x, y) === 'wet') return true;
  const dryAt = wet[String(y * map.width + x)];
  return dryAt !== undefined && dryAt > tick;
}

/** A wet check for the state as it is now. */
export function wetCheck(state: Pick<GameState, 'level' | 'wet' | 'tick'>): WetCheck {
  const { level, wet, tick } = state;
  return (x, y) => isWet(level, wet, tick, x, y);
}

/**
 * The mop robot's loop: the `r` tiles in driving order from the first one in
 * reading order, clockwise on screen or not. Empty without a closed loop.
 */
export function mopLoop(map: LevelMap, clockwise: boolean): GridPoint[] {
  const route = marksOf(map, 'mopRoute');
  const start = route[0];
  if (!start) return [];
  const onRoute = (p: GridPoint): boolean => route.some((r) => r.x === p.x && r.y === p.y);
  const loop: GridPoint[] = [start];
  let prev: GridPoint | null = null;
  let here = start;
  for (;;) {
    const from = prev;
    const next = SIDES.map((d) => ({ x: here.x + d.x, y: here.y + d.y })).find(
      (p) => onRoute(p) && !(from && p.x === from.x && p.y === from.y),
    );
    if (!next) return [];
    if (next.x === start.x && next.y === start.y) break;
    if (loop.length > route.length) return [];
    loop.push(next);
    prev = here;
    here = next;
  }
  // Shoelace sum with y down the screen: positive means clockwise as seen.
  let area = 0;
  loop.forEach((p, i) => {
    const q = loop[(i + 1) % loop.length] ?? p;
    area += p.x * q.y - q.x * p.y;
  });
  const isClockwise = area > 0;
  if (isClockwise === clockwise) return loop;
  const [first, ...rest] = loop;
  return first ? [first, ...rest.reverse()] : loop;
}

/** Whether tile (x, y) is on the spill zone of a tap (for render and bots). */
export function inSpillZone(map: LevelMap, x: number, y: number): boolean {
  return markAt(map, x, y) === 'spillZone';
}

/** Every wet tile now (for bots to walk round). */
export function wetTiles(state: Pick<GameState, 'level' | 'wet' | 'tick'>): GridPoint[] {
  const { level } = state;
  const isWetNow = wetCheck(state);
  const result: GridPoint[] = [];
  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) if (isWetNow(x, y)) result.push({ x, y });
  }
  return result;
}
