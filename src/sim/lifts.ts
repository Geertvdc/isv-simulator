/**
 * Lifts and the mail chute (Scale-Up chapter).
 *
 * A lift has a cabin on every floor it stops at: a connected group of `L`
 * tiles (local) or `l` tiles (express). All local cabins of a map make one
 * lift, all express cabins another; their floors are the cabins in reading
 * order (the floors are drawn top to bottom). A lift stands open at a floor,
 * then everyone standing in its cabin (players with what they carry, and
 * managers) rides to the next floor, keeping their place in the cabin. It
 * runs up and down the floors in turn. The express just has fewer floors.
 *
 * A breakdown (level setting) keeps a lift open where it is for a while.
 *
 * The mail chute is a pair of hatches (`H`, counters), the first in reading
 * order on top: a ticket put on the top hatch slides out of the bottom one.
 */

import {
  CHUTE_TICKS,
  EXPRESS_OPEN_TICKS,
  EXPRESS_RIDE_TICKS,
  LIFT_BREAKDOWN_WARNING_TICKS,
  LIFT_CHIME_TICKS,
  LIFT_OPEN_TICKS,
  LIFT_RIDE_TICKS,
  SHUTTLE_SPEED,
  SHUTTLE_WAIT_TICKS,
  TICKS_PER_SECOND,
} from './balance';
import { type GridPoint, type LevelMap, type MarkKind, marksOf } from './level';
import type { GameState, PlayerId } from './state';
import { ticketOnTile } from './tickets';

export type LiftKind = 'local' | 'express' | 'shuttle';

/** The express (or local) lift out of order from `atTick` for `ticks`. */
export interface LiftBreakdown {
  lift: LiftKind;
  atTick: number;
  ticks: number;
}

/** Who rides a lift that is between floors, and their place in the cabin. */
export interface Rider {
  kind: 'player' | 'manager';
  id: number;
  slot: number;
}

export interface Lift {
  kind: LiftKind;
  /** The cabin tiles at each floor, in reading order, floors top first. */
  stops: GridPoint[][];
  /** The floor it stands at, or rides to. */
  at: number;
  /** Which way it goes next: +1 down the list, -1 up it. */
  dir: 1 | -1;
  /** `open`: standing with the doors open at `at`; `riding`: on its way to `at`. */
  phase: 'open' | 'riding';
  /** Tick the phase ends (a breakdown holds an open lift past it). */
  until: number;
  /** Who is riding, while `riding`. */
  riders: Rider[];
}

export interface Chute {
  from: GridPoint;
  to: GridPoint;
  /** Tick the ticket on the top hatch went in; `null` while it's empty. */
  since: number | null;
}

const SIDES: readonly GridPoint[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

/** Connected groups of `kind` marks, each in reading order, groups by their first tile. */
function cabins(map: LevelMap, kind: MarkKind): GridPoint[][] {
  const tiles = marksOf(map, kind);
  const key = (p: GridPoint): number => p.y * map.width + p.x;
  const left = new Map(tiles.map((t) => [key(t), t]));
  const groups: GridPoint[][] = [];
  for (const start of tiles) {
    if (!left.has(key(start))) continue;
    const group: GridPoint[] = [];
    const todo = [start];
    left.delete(key(start));
    for (let p = todo.pop(); p; p = todo.pop()) {
      group.push(p);
      for (const d of SIDES) {
        const next = left.get(key({ x: p.x + d.x, y: p.y + d.y }));
        if (!next) continue;
        left.delete(key(next));
        todo.push(next);
      }
    }
    groups.push(group.sort((a, b) => key(a) - key(b)));
  }
  return groups;
}

function openTicks(kind: LiftKind): number {
  if (kind === 'shuttle') return SHUTTLE_WAIT_TICKS;
  return kind === 'express' ? EXPRESS_OPEN_TICKS : LIFT_OPEN_TICKS;
}

/** Ticks from floor `from` to the next one; the shuttle takes as long as the track is. */
function rideTicks(lift: Pick<Lift, 'kind' | 'stops'>, from = 0, to = 1): number {
  if (lift.kind === 'shuttle') {
    const a = lift.stops[from]?.[0];
    const b = lift.stops[to]?.[0];
    const tiles = a && b ? Math.abs(a.x - b.x) + Math.abs(a.y - b.y) : 1;
    return Math.ceil((tiles / SHUTTLE_SPEED) * TICKS_PER_SECOND);
  }
  return lift.kind === 'express' ? EXPRESS_RIDE_TICKS : LIFT_RIDE_TICKS;
}

/** The map's lifts: one local and one express at most, each with two floors or more. */
export function createLifts(map: LevelMap): Lift[] {
  const lifts: Lift[] = [];
  for (const [kind, mark] of [
    ['local', 'lift'],
    ['express', 'expressLift'],
    ['shuttle', 'shuttleStop'],
  ] as const) {
    const stops = cabins(map, mark);
    if (stops.length < 2) continue;
    lifts.push({ kind, stops, at: 0, dir: 1, phase: 'open', until: openTicks(kind), riders: [] });
  }
  return lifts;
}

/** The map's mail chutes: hatches paired in reading order, the first of a pair on top. */
export function createChutes(map: LevelMap): Chute[] {
  const hatches = marksOf(map, 'chute');
  const chutes: Chute[] = [];
  for (let i = 0; i + 1 < hatches.length; i += 2) {
    const from = hatches[i];
    const to = hatches[i + 1];
    if (from && to) chutes.push({ from, to, since: null });
  }
  return chutes;
}

/** Whether `lift` is out of order at `tick`. */
export function liftBroken(state: GameState, lift: Lift, tick = state.tick): boolean {
  return (state.settings.liftBreakdowns ?? []).some(
    (b) => b.lift === lift.kind && tick >= b.atTick && tick < b.atTick + b.ticks,
  );
}

/** Whether `lift` breaks down soon: its lights flicker. */
export function breakdownWarns(state: GameState, lift: Lift): boolean {
  return (state.settings.liftBreakdowns ?? []).some(
    (b) =>
      b.lift === lift.kind &&
      state.tick >= b.atTick - LIFT_BREAKDOWN_WARNING_TICKS &&
      state.tick < b.atTick,
  );
}

/** Whether an open lift chimes: it leaves within a second. */
export function liftChimes(state: GameState, lift: Lift): boolean {
  return (
    lift.phase === 'open' && !liftBroken(state, lift) && lift.until - state.tick <= LIFT_CHIME_TICKS
  );
}

/** Whether `playerId` is riding a lift between floors (and can't move). */
export function isRiding(state: GameState, playerId: PlayerId): boolean {
  return state.lifts.some(
    (l) => l.phase === 'riding' && l.riders.some((r) => r.kind === 'player' && r.id === playerId),
  );
}

function slotOf(cabin: readonly GridPoint[], pos: { x: number; y: number }): number {
  const x = Math.round(pos.x);
  const y = Math.round(pos.y);
  return cabin.findIndex((t) => t.x === x && t.y === y);
}

/** Everyone in the cabin at the lift's floor, each on a place of their own (extra people stay). */
function board(state: GameState, lift: Lift): Rider[] {
  const cabin = lift.stops[lift.at] ?? [];
  const inside: Rider[] = [];
  for (const p of state.players) {
    const slot = slotOf(cabin, p.pos);
    if (slot >= 0) inside.push({ kind: 'player', id: p.id, slot });
  }
  for (const m of state.managers) {
    if (m.kind !== 'manager') continue;
    const slot = slotOf(cabin, m.pos);
    if (slot >= 0) inside.push({ kind: 'manager', id: m.id, slot });
  }
  const taken = new Set<number>();
  const riders: Rider[] = [];
  const clash: Rider[] = [];
  for (const r of inside) {
    if (taken.has(r.slot)) clash.push(r);
    else {
      taken.add(r.slot);
      riders.push(r);
    }
  }
  for (const r of clash) {
    const free = cabin.findIndex((_, i) => !taken.has(i));
    if (free < 0) break;
    taken.add(free);
    riders.push({ ...r, slot: free });
  }
  return riders;
}

function depart(state: GameState, lift: Lift): void {
  let next = lift.at + lift.dir;
  if (next < 0 || next >= lift.stops.length) {
    lift.dir = lift.dir === 1 ? -1 : 1;
    next = lift.at + lift.dir;
  }
  const to = lift.stops[next] ?? [];
  const riders = board(state, lift).filter((r) => r.slot < to.length);
  for (const r of riders) {
    const at = to[r.slot];
    if (!at) continue;
    if (r.kind === 'player') {
      const p = state.players.find((pl) => pl.id === r.id);
      if (!p) continue;
      p.pos = { x: at.x, y: at.y };
      p.vel = { x: 0, y: 0 };
      p.dashTicks = 0;
    } else {
      const m = state.managers.find((mg) => mg.id === r.id);
      if (!m) continue;
      m.pos = { x: at.x, y: at.y };
      m.path = [];
      m.waitTicks = rideTicks(lift, lift.at, next);
    }
  }
  state.events.push({ type: 'liftDeparted', lift: lift.kind, floor: next });
  lift.riders = riders;
  lift.until = state.tick + rideTicks(lift, lift.at, next);
  lift.at = next;
  lift.phase = 'riding';
}

/** Per tick: lifts leave, arrive and break down; tickets slide down the chutes. */
export function updateLifts(state: GameState): void {
  for (const lift of state.lifts) {
    if (lift.phase === 'riding') {
      if (state.tick < lift.until) continue;
      lift.phase = 'open';
      lift.riders = [];
      lift.until = state.tick + openTicks(lift.kind);
      state.events.push({ type: 'liftArrived', lift: lift.kind, floor: lift.at });
      continue;
    }
    if (liftBroken(state, lift)) {
      // Out of order: it stays open where it is, and leaves a while after it's fixed.
      lift.until = Math.max(lift.until, state.tick + openTicks(lift.kind));
      continue;
    }
    if (state.tick >= lift.until) depart(state, lift);
  }
  for (const chute of state.chutes) {
    const ticket = ticketOnTile(state, chute.from.x, chute.from.y);
    if (!ticket) {
      chute.since = null;
      continue;
    }
    chute.since ??= state.tick;
    if (state.tick - chute.since < CHUTE_TICKS) continue;
    // A full bottom hatch holds the next ticket at the top.
    if (ticketOnTile(state, chute.to.x, chute.to.y)) continue;
    ticket.location = { kind: 'tile', x: chute.to.x, y: chute.to.y };
    chute.since = null;
    state.events.push({ type: 'chuteDropped', ticketId: ticket.id });
  }
}

/** The ticket on a chute's top hatch, and how far down it is (0 to 1), for render. */
export function chuteShare(state: GameState, chute: Chute): number {
  return chute.since === null ? 0 : Math.min(1, (state.tick - chute.since) / CHUTE_TICKS);
}

const linkCache = new WeakMap<LevelMap, Map<number, GridPoint[]>>();

/**
 * Where a lift takes you, as walking links for paths (bots, managers): every
 * cabin tile links to the same place in the cabins of the floors next to it.
 */
export function liftLinks(map: LevelMap): Map<number, GridPoint[]> {
  const cached = linkCache.get(map);
  if (cached) return cached;
  const links = new Map<number, GridPoint[]>();
  for (const mark of ['lift', 'expressLift', 'shuttleStop'] as const) {
    const stops = cabins(map, mark);
    stops.forEach((cabin, floor) => {
      cabin.forEach((tile, slot) => {
        const linked: GridPoint[] = [];
        for (const other of [stops[floor - 1], stops[floor + 1]]) {
          const to = other?.[Math.min(slot, other.length - 1)];
          if (to) linked.push(to);
        }
        links.set(tile.y * map.width + tile.x, linked);
      });
    });
  }
  linkCache.set(map, links);
  return links;
}

/** Whether the step from `from` to `to` is a lift ride, not a walk. */
export function isLiftHop(map: LevelMap, from: GridPoint, to: GridPoint): boolean {
  const here = { x: Math.round(from.x), y: Math.round(from.y) };
  return (liftLinks(map).get(here.y * map.width + here.x) ?? []).some(
    (p) => p.x === to.x && p.y === to.y,
  );
}
