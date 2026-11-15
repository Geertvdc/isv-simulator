/**
 * Reorgs and badge turnstiles (Enterprise chapter).
 *
 * A reorg level has a layout per phase (`LevelMap.phases`): partitions (`=`),
 * rolling desks (`D`) and meeting doors (`d`) move between them, nothing else
 * does. On the level's schedule the live map switches to the next phase's
 * layout, telegraphed `REORG_WARNING_TICKS` ahead. Rolling desks pair up in
 * reading order and take their ticket with them; a player, manager or
 * ticket on a tile that closes is moved to the nearest open floor.
 *
 * A badge turnstile (`+`) lets people through one way only (the level says
 * which way, per phase); thrown tickets fly over it both ways.
 */

import { REORG_WARNING_TICKS } from './balance';
import { type GridPoint, type LevelMap, type Layout, getTile, isSolid } from './level';
import { setLiveTile } from './liveTiles';
import type { BlockCheck } from './movement';
import type { GameState, Vec } from './state';

/** A layout change: at `atTick` the map takes phase `phase`'s layout (1 is the map's own). */
export interface ReorgStep {
  atTick: number;
  phase: number;
}

/** A one-way gate: people go through it along `dir` only. */
export interface Gate {
  x: number;
  y: number;
  dir: GridPoint;
}

const SIDES: readonly GridPoint[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

/** The layout of phase `phase` (1-based), or `undefined` without one. */
export function layoutOf(map: LevelMap, phase: number): Layout | undefined {
  return map.phases?.[phase - 1];
}

/** The marks of the layout the map is in now (the map's own without phases). */
export function currentMarks(state: Pick<GameState, 'level' | 'reorgPhase'>): Layout['marks'] {
  return layoutOf(state.level, state.reorgPhase)?.marks ?? state.level.marks;
}

/** The turnstiles of phase `phase` with the way they go then. Turnstiles never move. */
export function gatesFor(
  map: LevelMap,
  turnstiles: readonly (readonly GridPoint[])[] | undefined,
  phase: number,
): Gate[] {
  const dirs = turnstiles?.[phase - 1] ?? turnstiles?.[0] ?? [];
  return map.marks
    .filter((m) => m.kind === 'turnstile')
    .flatMap((m, i) => {
      const dir = dirs[i];
      return dir ? [{ x: m.x, y: m.y, dir: { x: dir.x, y: dir.y } }] : [];
    });
}

/**
 * The extra blocks for someone at `pos`: a gate is a wall to anyone on its
 * way-out side (they'd go through it backwards). Standing in it, it's open.
 */
export function gateBlocks(gates: readonly Gate[], pos: Vec): BlockCheck {
  if (gates.length === 0) return () => false;
  return (x, y) =>
    gates.some((g) => {
      if (g.x !== x || g.y !== y) return false;
      if (Math.round(pos.x) === x && Math.round(pos.y) === y) return false;
      return (pos.x - x) * g.dir.x + (pos.y - y) * g.dir.y > 0;
    });
}

/** Whether a walk from `from` to the next tile `to` goes through a gate the wrong way. */
export function gateRefuses(gates: readonly Gate[], from: GridPoint, to: GridPoint): boolean {
  const step = { x: to.x - from.x, y: to.y - from.y };
  return gates.some(
    (g) =>
      ((g.x === to.x && g.y === to.y) || (g.x === from.x && g.y === from.y)) &&
      (step.x !== g.dir.x || step.y !== g.dir.y),
  );
}

/** The next reorg, if one is due within the warning time: what changes and in how many ticks. */
export function reorgWarning(state: GameState): { inTicks: number; tiles: number[] } | null {
  const step = state.settings.reorgs?.[state.nextReorg];
  const layout = step && layoutOf(state.level, step.phase);
  if (!step || !layout) return null;
  const inTicks = step.atTick - state.tick;
  if (inTicks > REORG_WARNING_TICKS || inTicks < 0) return null;
  const tiles: number[] = [];
  layout.tiles.forEach((tile, i) => {
    if (state.level.tiles[i] !== tile) tiles.push(i);
  });
  return { inTicks, tiles };
}

/** The nearest walkable tile to `from` on the live map (breadth first), `from` itself if open. */
function nearestOpen(map: LevelMap, from: GridPoint): GridPoint {
  const key = (p: GridPoint): number => p.y * map.width + p.x;
  const seen = new Set([key(from)]);
  const queue = [from];
  for (let i = 0; i < queue.length; i++) {
    const at = queue[i];
    if (!at) break;
    if (!isSolid(getTile(map, at.x, at.y))) return at;
    for (const d of SIDES) {
      const next = { x: at.x + d.x, y: at.y + d.y };
      if (getTile(map, next.x, next.y) === null || seen.has(key(next))) continue;
      seen.add(key(next));
      queue.push(next);
    }
  }
  return from;
}

function desksOf(layout: Layout): GridPoint[] {
  return layout.marks.filter((m) => m.kind === 'rollingDesk').map(({ x, y }) => ({ x, y }));
}

/** Puts phase `phase`'s layout on the live map: desks roll with their tickets, people step out. */
export function applyReorg(state: GameState, phase: number): void {
  const from = layoutOf(state.level, state.reorgPhase);
  const to = layoutOf(state.level, phase);
  if (!from || !to) return;
  // Tickets on rolling desks roll along: the k-th desk goes to the k-th desk.
  const fromDesks = desksOf(from);
  const toDesks = desksOf(to);
  const riding = fromDesks.flatMap((desk, k) => {
    const ticket = state.tickets.find(
      (t) => t.location.kind === 'tile' && t.location.x === desk.x && t.location.y === desk.y,
    );
    const dest = toDesks[k];
    return ticket && dest ? [{ ticket, dest }] : [];
  });
  const { width } = state.level;
  to.tiles.forEach((tile, i) => {
    if (state.level.tiles[i] !== tile) setLiveTile(state, i % width, Math.floor(i / width), tile);
  });
  for (const { ticket, dest } of riding) ticket.location = { kind: 'tile', x: dest.x, y: dest.y };
  // A ticket left on a tile that is now a wall (not on a desk) goes to the nearest floor.
  for (const t of state.tickets) {
    if (t.location.kind !== 'tile' || riding.some((r) => r.ticket === t)) continue;
    const { x, y } = t.location;
    if (getTile(state.level, x, y) === 'wall') {
      const open = nearestOpen(state.level, { x, y });
      t.location = { kind: 'tile', x: open.x, y: open.y };
    }
  }
  for (const body of [...state.players, ...state.managers]) {
    const here = { x: Math.round(body.pos.x), y: Math.round(body.pos.y) };
    if (!isSolid(getTile(state.level, here.x, here.y))) continue;
    const open = nearestOpen(state.level, here);
    body.pos = { x: open.x, y: open.y };
  }
  for (const m of state.managers) m.path = [];
  state.reorgPhase = phase;
  state.gates = gatesFor(state.level, state.settings.turnstiles, phase);
  state.events.push({ type: 'reorg', phase });
}

/** Per tick: the next reorg on the schedule happens when it's due. */
export function updateReorgs(state: GameState): void {
  const step = state.settings.reorgs?.[state.nextReorg];
  if (!step || state.tick < step.atTick) return;
  state.nextReorg++;
  applyReorg(state, step.phase);
}

/** Tile indexes whose tile differs between reorg phases: the ones that move. */
export function reorgTiles(map: LevelMap): number[] {
  const phases = map.phases ?? [];
  const result: number[] = [];
  map.tiles.forEach((tile, i) => {
    if (phases.some((p) => p.tiles[i] !== tile)) result.push(i);
  });
  return result;
}

/** `map` with its moving tiles as floor: what stays put, for drawing once. */
export function withoutReorgTiles(map: LevelMap): LevelMap {
  const moving = reorgTiles(map);
  if (moving.length === 0) return map;
  const tiles = [...map.tiles];
  for (const i of moving) tiles[i] = 'floor';
  return { ...map, tiles };
}
